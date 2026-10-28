# Members, forms, moves and directory (Steps 10, 3 + 8, 20)

Read `docs/glossary.md` for Person, Owner, Renter, Resident and Member.

## People and occupancy

- Add people through `PartiesService.resolve` / `resolvePerson` (reuse by phone, then NID), not `persons.create`. A person's area is where they own, rent or live now (`PartiesService.currentPaths`); check it with `canOnParty`.
- Never send an NID to a caller who can't edit the person, and never put one in an audit row (`hasNid` only).
- `units.occupancy` is derived: call `OccupancyService.refresh(societyId, path, tx)` (property module) in the same transaction as any change to units, ownerships, tenancies or residents (occupants). Rule (Anis, 2026-10-28): `rented` while a tenancy is active or moving out; `owner_occupied` only while a resident of the owner's household (an occupant with no tenancy, such as an owner marked "Lives here") lives there; otherwise `vacant`, even when the unit or a place above it is owned. Migration `27_occupancy_residents` recomputed existing units.
- A renter who is a person is added as a resident (`occupants`, head) when the tenancy is created; owners become residents through "Lives here" (`POST /occupants` with `personId`, allowed only for a current owner at or above the unit, or the tenancy's renter).
- A registered member is a `memberships` row (numbered per society, one active per person); owners, renters and residents are not members.

## Public forms and office review

- Form files (deeds, NID copies) are private files (`docs/rules/cms-storage.md`).
- Approvals that create members data run in one transaction through `TenanciesService.insert` / `OwnershipsService.insert` and `PartiesService.resolvePerson`; change a submission's status only with a conditional update on the open statuses (`form_closed` otherwise).

## Moves and directory

- Start, complete or cancel moves only through `MovesService` (`src/members`); a tenancy's status follows its open move (`PATCH /tenancies/:id` refuses a status change while one is open). End tenancies inside a transaction with `TenanciesService.endIn`, which also cancels an open move.
- Checklist keys are fixed in shared (`MOVE_CHECKLIST`), labels in i18n. A move-out with unpaid bills on the unit needs `tenancies.approve`.
- The resident directory (`DirectoryService`) reads current `occupants` rows only; it never returns an NID.
