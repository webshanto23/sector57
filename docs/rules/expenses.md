# Expenses and budgets (Step 16)

Shared money rules are in `docs/rules/finance.md`.

- Move expenses only through `ExpensesService` (`src/expenses`); who may do what is `expenseActions` in shared. Another module that raises a request inside its own transaction uses `createIn` (work orders) and checks `expenses.create` itself.
- Paying takes `lockFinanceSetup`, refuses more than the fund holds in that account (409 `fund_insufficient`) and writes one `out` ledger row (`source_type = 'expense'`); a void writes the reversing `in` row.
- Expense vouchers are private files (`PrivateFilesService`, area `expenses`) served only through `GET /expenses/:id/vouchers/:documentId`.
