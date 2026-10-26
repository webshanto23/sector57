# Cash collection, receipts, handover and donations (Steps 14–15)

Shared money rules are in `docs/rules/finance.md`.

## Payments

- Take money only through `PaymentsService` (`src/payments`): it locks the bills `FOR UPDATE`, settles them oldest first (`allocate` in shared), writes one `in` ledger row per fund and the payer snapshot.
- A payment is area-scoped through `payments.unit_id`; one with no unit needs a society-wide grant.
- A void reverses the bills' `paid` and the ledger rows, never deletes; after the day or once handed over it needs `payments.approve`.
- Handovers are confirmed by someone other than the collector, and take all of a collector's **cash** payments, bills and donations alike. Bank, cheque and mobile payments went straight to the bank account: they never enter a handover or the "in hand" figures.
- Printable documents go in `PrintSheet` (`components/print`); the print CSS in `globals.css` shows only that, on A5, in light colours.

## Donations

- Record donations only through `DonationsService` (`src/donations`): it writes the donation, its receipt (a `payments` row with no unit and no allocations, `payer_snapshot` null when anonymous) and the one `in` ledger row (`source_type = 'donation'`). The receipt writes no ledger row.
- A donation's receipt is voided only through `POST /donations/:id/void` (`/payments/:id/void` answers 409 `use_donation_void`); `mayVoidReceipt` (payments service) holds the collector-or-approver rule for both.
- Anything that sums `payments` for bills must leave donation receipts out (`kind`, or join `donations`).
