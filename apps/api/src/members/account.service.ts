import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@s57/db';
import type { Me, MeUpdateInput } from '@s57/shared';
import { AuditService } from '../audit/audit.service.js';
import { meSelect, toMe } from '../auth/auth.service.js';
import { ENV, type Env } from '../config/env.js';
import type { Actor } from '../permissions/permissions.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaService } from '../storage/media.service.js';
import { auditOf, PartiesService } from './parties.service.js';

type Tx = Prisma.TransactionClient;

const loggedOut = () => new UnauthorizedException({ code: 'unauthenticated', message: 'Please log in' });
const nameLocked = () => new ConflictException({ code: 'name_locked', message: 'A verified name can be changed only by the office' });
const nameRequired = () => new ConflictException({ code: 'name_required', message: 'Save your name before adding a photo' });

/**
 * The logged-in user's own name and photo, kept on the person their login is linked to.
 * A login without a person gets one (by phone, so an existing record is reused) when they
 * first save a name. A verified person's name is the office's to change; the photo stays theirs.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** 409 `name_locked` when the person is verified. */
  async update(actor: Actor, input: MeUpdateInput): Promise<Me> {
    await this.prisma.$transaction(async (tx) => {
      const user = await this.user(tx, actor);
      let personId = user.person_id;
      if (!personId) {
        const blank = { email: null, nid: null, dateOfBirth: null, gender: null };
        personId = (await this.parties.resolvePerson(tx, actor.societyId, { ...blank, ...this.names(input), phone: user.phone })).id;
        await tx.users.update({ where: { id: user.id }, data: { person_id: personId } });
        await this.audit.record({ ...auditOf(actor, 'user', 'person_link', user.id), after: { personId } }, tx);
      }
      const person = await tx.persons.findUniqueOrThrow({ where: { id: personId }, select: { full_name: true, full_name_en: true, verified_at: true } });
      if (person.verified_at) throw nameLocked();
      await tx.persons.update({ where: { id: personId }, data: { full_name: input.name, full_name_en: input.nameEn } });
      await this.audit.record(
        {
          ...auditOf(actor, 'person', 'self_update', personId),
          before: { fullName: person.full_name, fullNameEn: person.full_name_en },
          after: { fullName: input.name, fullNameEn: input.nameEn },
        },
        tx,
      );
    });
    return this.me(actor);
  }

  /** 409 `name_required` while the login has no person yet. */
  async setPhoto(actor: Actor, upload: Buffer): Promise<Me> {
    const personId = await this.personId(actor);
    const key = await this.media.saveImage(actor.societyId, 'people', upload);
    let old: string | null;
    try {
      old = await this.replacePhoto(actor, personId, key);
    } catch (error) {
      await this.media.removeQuietly(actor.societyId, [key]);
      throw error;
    }
    await this.media.removeQuietly(actor.societyId, [old]);
    return this.me(actor);
  }

  async removePhoto(actor: Actor): Promise<Me> {
    const personId = await this.personId(actor);
    const old = await this.replacePhoto(actor, personId, null);
    await this.media.removeQuietly(actor.societyId, [old]);
    return this.me(actor);
  }

  private names(input: MeUpdateInput) {
    return { fullName: input.name, fullNameEn: input.nameEn };
  }

  private async user(tx: Tx, actor: Actor) {
    const user = await tx.users.findFirst({
      where: { id: actor.userId, society_id: actor.societyId, status: 'active' },
      select: { id: true, phone: true, person_id: true },
    });
    if (!user) throw loggedOut();
    return user;
  }

  private async personId(actor: Actor): Promise<string> {
    const { person_id } = await this.user(this.prisma, actor);
    if (!person_id) throw nameRequired();
    return person_id;
  }

  private replacePhoto(actor: Actor, personId: string, key: string | null): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const person = await tx.persons.findUniqueOrThrow({ where: { id: personId }, select: { photo_url: true } });
      await tx.persons.update({ where: { id: personId }, data: { photo_url: key } });
      await this.audit.record(
        { ...auditOf(actor, 'person', key ? 'photo_set' : 'photo_remove', personId), before: { photo: person.photo_url }, after: { photo: key } },
        tx,
      );
      return person.photo_url;
    });
  }

  private async me(actor: Actor): Promise<Me> {
    const user = await this.prisma.users.findFirst({ where: { id: actor.userId, society_id: actor.societyId }, select: meSelect });
    if (!user) throw loggedOut();
    return toMe(user, this.env.MEDIA_BASE_URL);
  }
}
