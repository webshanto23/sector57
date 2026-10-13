# Permissions, roles and users (Steps 5–6)

## Permission engine

- Every logged-in route declares `@Can(module, action)` or `@Authenticated()`; anything else is refused.
- Narrow queries with `scopeWhere(...)`, check single rows with `access.can(action, module, { path })`, and answer 404 for rows out of scope.
- `locations.path` is `/<root id>/.../<own id>/` (`locationPath` in shared); a scope covers rows whose path starts with its path. Only `LOCATION_SCOPED_MODULES` respect a scope; a scoped role grants nothing on other modules.
- Writes are audited by the global `AuditInterceptor`; name the entity with `@AuditEntity(...)`, or `@SkipAudit()` when the handler records its own row.
- New permission modules go in both `PERMISSION_MODULES` (shared) and the seed; the e2e test checks they match.

## Roles and users admin

- Grant limits live in `apps/api/src/permissions/grant-limits.ts`: a caller grants only what they hold society-wide, assigns a role only over an area where they hold all its permissions, and changes only users they could have given every role to. Only full access touches the system role, which is read-only.
- Services that check grant limits or write their own audit rows take an `Actor` (`@CurrentActor()`: society, user id, access, IP). Validate `:id` with `IdParamDto` (`src/common`).

## Dashboard

- Dashboard pages call `requirePermission(module, action)` (404 otherwise) and load data through `src/lib/api/admin.ts` (and the other wrappers in `src/lib/api`).
- Module labels for any UI are in `Admin.modules`, and the matrix order in `components/admin/modules.ts` (a new module fails to compile until it is placed there).
