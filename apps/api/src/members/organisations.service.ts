import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import type { OrganisationDetail, OrganisationUpdateInput, PermissionAction } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { isForeignKeyViolation } from '../common/prisma-errors.js';
import { scopeWhere } from '../permissions/caller-access.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beyondPermissions } from '../property/tree.service.js';
import { MemberRowsService, personPartySelect } from './member-rows.service.js';
import { auditOf, canOnParty, organisationNotFound, PartiesService, tradeLicenceRequired } from './parties.service.js';

const inUse = () => new ConflictException({ code: 'organisation_in_use', message: 'This organisation still owns, rents or has bills' });

const select = {
  id: true,
  name: true,
  trade_licence: true,
  created_at: true,
  persons: { select: personPartySelect },
} satisfies Prisma.organisationsSelect;
type Row = Prisma.organisationsGetPayload<{ select: typeof select }>;

const snapshot = (row: Pick<Row, 'name' | 'trade_licence'>) => ({ name: row.name, tradeLicence: row.trade_licence });

/** Companies, shops and NGOs that own or rent (`members` permission, like people). */
@Injectable()
export class OrganisationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly parties: PartiesService,
    private readonly rows: MemberRowsService,
  ) {}

  async get(actor: Actor, id: string): Promise<OrganisationDetail> {
    const { row, paths } = await this.visible(actor, id);
    const at = (module: 'ownerships' | 'tenancies') => scopeWhere(actor.access, 'view', module, (prefix) => ({ path: { startsWith: prefix } }));
    const [ownerships, tenancies] = await Promise.all([
      this.rows.ownerships(actor.societyId, { organisation_id: id, locations: at('ownerships') }),
      this.rows.tenancies(actor.societyId, { organisation_id: id, units: { locations: at('tenancies') } }),
    ]);
    return {
      id: row.id,
      name: row.name,
      tradeLicence: row.trade_licence,
      contact: row.persons ? this.rows.personParty(row.persons) : null,
      createdAt: row.created_at.toISOString(),
      ownerships,
      tenancies,
      can: { edit: canOnParty(actor.access, 'edit', paths), delete: canOnParty(actor.access, 'delete', paths) },
    };
  }

  async update(actor: Actor, id: string, input: OrganisationUpdateInput): Promise<OrganisationDetail> {
    const { row: before } = await this.allowed(actor, id, 'edit');
    // An organisation that owns or rents keeps its trade licence while the society requires it.
    if (
      before.trade_licence &&
      !input.tradeLicence &&
      (await this.parties.idsRequired(this.prisma, actor.societyId)) &&
      (await this.parties.holdsRole(actor.societyId, { organisationId: id }))
    ) {
      throw tradeLicenceRequired();
    }
    await this.prisma.$transaction(async (tx) => {
      const after = await tx.organisations.update({ where: { id }, data: { name: input.name, trade_licence: input.tradeLicence }, select });
      await this.audit.record({ ...auditOf(actor, 'organisation', 'update', id), before: snapshot(before), after: snapshot(after) }, tx);
    });
    return this.get(actor, id);
  }

  async remove(actor: Actor, id: string): Promise<void> {
    const { row } = await this.allowed(actor, id, 'delete');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.organisations.delete({ where: { id } });
        await this.audit.record({ ...auditOf(actor, 'organisation', 'delete', id), before: snapshot(row) }, tx);
      });
    } catch (error) {
      throw isForeignKeyViolation(error) ? inUse() : error;
    }
  }

  private async visible(actor: Actor, id: string): Promise<{ row: Row; paths: string[] }> {
    const row = await this.prisma.organisations.findFirst({ where: { id, society_id: actor.societyId }, select });
    if (!row) throw organisationNotFound();
    const paths = await this.parties.currentPaths(actor.societyId, { organisationId: id });
    if (!canOnParty(actor.access, 'view', paths)) throw organisationNotFound();
    return { row, paths };
  }

  private async allowed(actor: Actor, id: string, action: PermissionAction) {
    const found = await this.visible(actor, id);
    if (!canOnParty(actor.access, action, found.paths)) throw beyondPermissions();
    return found;
  }
}
