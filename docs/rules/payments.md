# Cash collection, receipts, handover and donations (Steps 14–15)

Shared money rules are in `docs/rules/finance.md`.

## Payments

- Take money only through `PaymentsService` (`src/payments`): it locks the bills `FOR UPDATE`, settles them oldest first (`allocate` in shared), writes one `in` ledger row per fund and the payer snapshot.
- A payment is area-scoped through `payments.unit_id`; one with no unit needs a society-wide grant.
- A membership-fee payment names its member by `personId` or `organisationId` (exactly one beside `unitId`); the collect lookup marks a member account with `memberKind` so the web sends the right one.
- A void reverses the bills' `paid` and the ledger rows, never deletes; after the day or once handed over it needs `payments.approve`.
- Handovers are confirmed by someone other than the collector, and take all of a collector's **cash** payments, bills and donations alike. Bank, cheque and mobile payments went straight to the bank account: they never enter a handover or the "in hand" figures.
- Printable documents go in `PrintSheet` (`components/print`); the print CSS in `globals.css` shows only that, on A5 unless a named page says otherwise (`a4` lists, `bill-a4`, `thermal80`), in light colours. Receipts (bill payments and donations) print on A5 or the 80 mm roll through the paper picker (`print_formats.receipt`, in the receipt detail as `print`); the thermal receipt is `collect/receipt-thermal.tsx`, from the same `receiptOf` data.
- The collect page opens with `?unitId=` / `?personId=` / `?organisationId=` and any number of `invoiceId` params (only those bills start ticked). The bills list's "Take payment for ticked" uses it; it needs open bills of one account, since one receipt is for one unit or member. Bulk collection across accounts is not built.
- The collect page's search runs as you type; only the newest search may show its answer, and an empty box returns to the open list. While an account is chosen the day's figures shrink to one line and today's receipts hide. Save is never grey without a reason beside it. On a phone the total and Save stay on screen (`sticky`) and the receipt opens as a sheet (`<dialog>`).
- The collect page's area filter uses `GET /collect/areas` (`AreaTree` on `payments.create`), so a collector needs no `units` grant. `areaId` on `/collect/lookup` narrows a search or the open list (`OPEN_IN_AREA`), never widens the caller's area, and leaves members out; a place out of reach is 404.
- The cash "handed over / give back" helper is display only; nothing about it is saved.
- The payer dropdown shows name and phone: a payer option has no role, because payers are the bills' bill-tos.
- `GET /collect/lookup?open=true` (no other parameter) lists the accounts in the caller's area whose open bills are newest (`OPEN_ACCOUNTS` = 20 units, plus members for society-wide collectors); with nothing asked it still returns none.

## Donations

- Record donations only through `DonationsService` (`src/donations`): it writes the donation, its receipt (a `payments` row with no unit and no allocations, `payer_snapshot` null when anonymous) and the one `in` ledger row (`source_type = 'donation'`). The receipt writes no ledger row.
- A donation's receipt is voided only through `POST /donations/:id/void` (`/payments/:id/void` answers 409 `use_donation_void`); `mayVoidReceipt` (payments service) holds the collector-or-approver rule for both.
- Anything that sums `payments` for bills must leave donation receipts out (`kind`, or join `donations`).
