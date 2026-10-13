# Helpdesk and work orders (Step 24)

- Change tickets only through `TicketsService` / `TicketActionsService` (`src/helpdesk`); module `helpdesk`, area-scoped through `tickets.location_id`. Every change writes a `ticket_events` row and an audit row in the same transaction (`TicketsService.event`); the timeline is only ever added to.
- Tickets are never deleted: they are closed or cancelled. Who may make each status change is `ticketStatusMoves` in shared; status changes and assigning are conditional updates on the old status (409 `ticket_status_changed`).
- Ticket numbers come from `NumberingService` kind `ticket` (`T-NNNN`, never restarts). The due time is `ticketDueAt` with the hours from `HelpdeskService.slaHours` (setting `helpdesk_sla_hours`, changed with `settings.edit`); overdue is derived (`isTicketOverdue`), never stored.
- Change work orders only through `WorkOrdersService` / `WorkOrderActionsService` (`src/work-orders`); module `work_orders`, area-scoped through `work_orders.location_id`. Numbers come from `NumberingService` kind `work_order` (`WO-YY-NNNN`, by fiscal year). Never deleted: done or cancelled (`workOrderMoves` in shared).
- A work order never touches the ledger: a cost becomes a pending expense through `ExpensesService.createIn` inside the same transaction, and Expenses approves and pays it as usual.
- Web: `/dashboard/helpdesk` and `/dashboard/work` (`src/lib/api/helpdesk.ts`); staff are picked with `CustodianPicker` and its `source` (`tickets` / `work-orders`). Ticket and work order chips are in `components/helpdesk/ticket-chips.tsx`.
- A person reporter shows by name only; a typed reporter keeps the name and phone the office typed.
