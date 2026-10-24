import { Prisma } from '@s57/db';
import {
  bnDigits,
  formatDate,
  unitText,
  type CertificateLang,
  type CertificateRow,
  type CertificateStatus,
  type CertificateType,
  type CertificateValues,
  type Place,
} from '@s57/shared';
import { placeSelect } from '../members/member-rows.service.js';

const userName = { select: { id: true, phone: true, persons: { select: { full_name: true } } } } satisfies Prisma.usersDefaultArgs;
type UserName = Prisma.usersGetPayload<typeof userName>;

export const userRefOf = (row: UserName | null) => (row ? { id: row.id, name: row.persons?.full_name ?? row.phone } : null);

export const certificateSelect = {
  id: true,
  cert_no: true,
  type: true,
  lang: true,
  status: true,
  person_id: true,
  addressee: true,
  purpose: true,
  body: true,
  signer_name: true,
  signer_title: true,
  dues_owed: true,
  issued_at: true,
  voided_at: true,
  void_reason: true,
  created_at: true,
  persons: { select: { id: true, full_name: true, full_name_en: true } },
  units: { select: { locations: { select: placeSelect } } },
  users_issued: userName,
  users_voided: userName,
  users: userName,
} satisfies Prisma.certificatesSelect;
export type CertificateSelected = Prisma.certificatesGetPayload<{ select: typeof certificateSelect }>;

export const certificatePlace = (row: CertificateSelected) => row.units.locations;

/** One certificate as a list shows it; `place` comes from `MemberRowsService.places`. */
export function certificateRowOf(row: CertificateSelected, place: Place): CertificateRow {
  return {
    id: row.id,
    certNo: row.cert_no,
    type: row.type as CertificateType,
    lang: row.lang as CertificateLang,
    status: row.status as CertificateStatus,
    person: { id: row.persons.id, name: row.persons.full_name, nameEn: row.persons.full_name_en },
    place,
    purpose: row.purpose,
    issuedAt: row.issued_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

/** What the audit log keeps of a certificate. */
export const certificateSnapshot = (row: CertificateSelected) => ({
  certNo: row.cert_no,
  type: row.type,
  lang: row.lang,
  status: row.status,
  personId: row.person_id,
  unitId: row.units.locations.id,
  addressee: row.addressee,
  purpose: row.purpose,
});

/** Everything a template may name, in the letter's language. `day` is the issue day (`YYYY-MM-DD`). */
export function letterValues(input: {
  lang: CertificateLang;
  person: { full_name: string; full_name_en: string | null };
  place: Place;
  society: { name_bn: string; name_en: string | null };
  day: string;
  certNo: string | null;
  memberNo: number | null;
  addressee: string | null;
  purpose: string | null;
}): CertificateValues {
  const en = input.lang === 'en';
  return {
    name: en ? (input.person.full_name_en ?? input.person.full_name) : input.person.full_name,
    unit: unitText(input.place),
    society: en ? (input.society.name_en ?? input.society.name_bn) : input.society.name_bn,
    date: formatDate(input.day, input.lang),
    certNo: input.certNo,
    memberNo: input.memberNo === null ? null : en ? String(input.memberNo) : bnDigits(input.memberNo),
    addressee: input.addressee,
    purpose: input.purpose,
  };
}
