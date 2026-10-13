# Property: location tree and units (Step 9)

- Module `src/property`: `TreeService` reads the tree (`visible`, `parentFor`, `nodes` with counts, `breadcrumb`). Call `parentFor(access, societyId, parentId, module)` before adding anything under a location.
- The deepest level holds units: a `locations` row plus a `units` row, written together only through `UnitsService`. A location may sit at any level deeper than its parent (levels can be skipped).
- `locations.name` uses the ICU collation `natural_sort` (migration `3_property`), so ordering by name is natural for Bangla and ASCII digits. Holding codes and top-level names are unique per society.
- Searches over names should try both digit forms (`digitVariants` in shared).
- `units.occupancy` is derived, never typed: call `OccupancyService.refresh(societyId, path, tx)` in the same transaction as any change to units, ownerships or tenancies.
