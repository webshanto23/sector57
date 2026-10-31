import { INestApplication } from '@nestjs/common';
import { Prisma } from '@s57/db';
import { AUTH_COOKIES, CSRF_HEADER, locationPath } from '@s57/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { TokensService } from './../src/auth/tokens.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './create-app.js';

const MARK = `e2e-owner-uses-${Date.now()}`;
const CSRF = 'csrf-token-for-tests';
const ORIGIN = 'http://localhost:3000';

/** "Owner uses this": counts as owner occupied, needs an owner, and never outlives a sale. */
describe('Owner uses this (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let societyId: string;
  let admin: string;
  let levels: { building: string; floor: string; unit: string };

  const server = () => request(app.getHttpServer());
  const write = (method: 'post' | 'patch' | 'delete', url: string) => server()[method](url).set('Cookie', admin).set('Origin', ORIGIN).set(CSRF_HEADER, CSRF);
  const unitRow = (id: string) => prisma.units.findUniqueOrThrow({ where: { location_id: id }, select: { occupancy: true, owner_uses: true } });
  const tick = (id: string, ownerUses = true) => write('patch', `/units/${id}`).send({ ownerUses });
  const person = async (name: string) => (await prisma.persons.create({ data: { society_id: societyId, full_name: `${name} ${MARK}` } })).id;
  const existing = (id: string) => ({ kind: 'existing', party: { kind: 'person', id } });
  const own = async (location_id: string, person_id: string) =>
    (await prisma.ownerships.create({ data: { society_id: societyId, location_id, person_id, share_percent: new Prisma.Decimal(100), start_date: new Date('2020-01-01') } })).id;

  async function place(levelId: string, parent: { id: string; path: string } | null, name: string) {
    const id = randomUUID();
    const path = parent ? locationPath(parent.path, id) : `/${id}/`;
    await prisma.locations.create({ data: { id, society_id: societyId, level_id: levelId, parent_id: parent?.id ?? null, name: `${name} ${id}`, path } });
    return { id, path };
  }

  /** A building with one floor holding one unit. */
  async function tower() {
    const building = await place(levels.building, null, MARK);
    const floor = await place(levels.floor, building, 'Floor');
    const unit = await place(levels.unit, floor, 'Unit');
    await prisma.units.create({ data: { location_id: unit.id, society_id: societyId, unit_type: 'residential' } });
    return { building: building.id, floor: floor.id, unit: unit.id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    societyId = (await prisma.societies.findUniqueOrThrow({ where: { slug: 'sector57' } })).id;
    const rows = await prisma.location_levels.findMany({ where: { society_id: societyId }, orderBy: { depth: 'asc' } });
    const [building, floor] = rows.filter((level) => !level.is_unit_level).slice(-2);
    levels = { building: building!.id, floor: floor!.id, unit: rows.find((level) => level.is_unit_level)!.id };

    const role = await prisma.roles.create({ data: { society_id: societyId, name: `${MARK}-admin` } });
    const permissions = await prisma.permissions.findMany();
    await prisma.role_permissions.createMany({ data: permissions.map((row) => ({ role_id: role.id, permission_id: row.id })) });
    const phone = `019${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    const me = await prisma.persons.create({ data: { society_id: societyId, full_name: `Admin ${MARK}`, phone } });
    const user = await prisma.users.create({ data: { society_id: societyId, person_id: me.id, phone, status: 'active' } });
    await prisma.user_roles.create({ data: { user_id: user.id, role_id: role.id } });
    admin = `${AUTH_COOKIES.access}=${await app.get(TokensService).signAccess({ userId: user.id, societyId, sessionId: randomUUID() })}; ${AUTH_COOKIES.csrf}=${CSRF}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a current owner, and makes the unit owner occupied until unticked', async () => {
    const ids = await tower();
    await tick(ids.unit).expect(409).expect((res) => expect(res.body.code).toBe('no_owner'));
    expect((await server().get(`/units/${ids.unit}`).set('Cookie', admin).expect(200)).body.can.ownerUse).toBe(false);

    await own(ids.building, await person('Owner'));
    expect((await server().get(`/units/${ids.unit}`).set('Cookie', admin).expect(200)).body.can.ownerUse).toBe(true);
    await tick(ids.unit).expect(200);
    expect(await unitRow(ids.unit)).toEqual({ occupancy: 'owner_occupied', owner_uses: true });

    await tick(ids.unit, false).expect(200);
    expect(await unitRow(ids.unit)).toEqual({ occupancy: 'vacant', owner_uses: false });
  });

  it('gives way to a tenancy', async () => {
    const ids = await tower();
    const renter = await person('Renter');
    await own(ids.unit, await person('Owner'));
    await tick(ids.unit).expect(200);
    await prisma.tenancies.create({ data: { society_id: societyId, unit_id: ids.unit, renter_type: 'family', primary_person_id: renter, start_date: new Date('2025-01-01'), status: 'active' } });
    await tick(ids.unit).expect(200);
    expect(await unitRow(ids.unit)).toEqual({ occupancy: 'rented', owner_uses: true });
  });

  it('clears on a transfer, and writes it to the audit log', async () => {
    const ids = await tower();
    await own(ids.unit, await person('Seller'));
    await tick(ids.unit).expect(200);
    await write('post', '/ownerships/transfer')
      .send({ locationId: ids.unit, date: '2026-01-01', owners: [{ owner: existing(await person('Buyer')), sharePercent: '100' }] })
      .expect(200);
    expect(await unitRow(ids.unit)).toEqual({ occupancy: 'vacant', owner_uses: false });
    expect(await prisma.audit_logs.count({ where: { action: 'owner_use_cleared', entity_id: ids.unit } })).toBe(1);
  });

  it('clears when the owner is ended or removed', async () => {
    const ended = await tower();
    const endedOwner = await own(ended.floor, await person('Seller'));
    await tick(ended.unit).expect(200);
    await write('post', `/ownerships/${endedOwner}/end`).send({ endDate: '2026-01-01' }).expect(200);
    expect((await unitRow(ended.unit)).owner_uses).toBe(false);

    const removed = await tower();
    const removedOwner = await own(removed.unit, await person('Mistake'));
    await tick(removed.unit).expect(200);
    await write('delete', `/ownerships/${removedOwner}`).expect(204);
    expect(await unitRow(removed.unit)).toEqual({ occupancy: 'vacant', owner_uses: false });
  });

  it('clears when a floor is sold by adding its first owner, but not for a co-owner', async () => {
    const ids = await tower();
    await own(ids.building, await person('Concord'));
    await tick(ids.unit).expect(200);
    const add = async (name: string, sharePercent: string) =>
      write('post', '/ownerships')
        .send({ locationId: ids.floor, owner: existing(await person(name)), sharePercent, startDate: '2026-01-01' })
        .expect(201);

    await add('Air India', '60');
    expect((await unitRow(ids.unit)).owner_uses).toBe(false);
    await tick(ids.unit).expect(200);
    await add('Partner', '40');
    expect((await unitRow(ids.unit)).owner_uses).toBe(true);
  });

  it('stays when the building is sold but a nearer owner holds the floor', async () => {
    const ids = await tower();
    await own(ids.building, await person('Concord'));
    await own(ids.floor, await person('Air India'));
    await tick(ids.unit).expect(200);
    await write('post', '/ownerships/transfer')
      .send({ locationId: ids.building, date: '2026-01-01', owners: [{ owner: existing(await person('New Group')), sharePercent: '100' }] })
      .expect(200);
    expect(await unitRow(ids.unit)).toEqual({ occupancy: 'owner_occupied', owner_uses: true });
  });
});
