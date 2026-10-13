# Facilities and assets (Step 23)

- Change facilities only through `FacilitiesService` and assets through `AssetsService` / `MaintenanceService` (`src/facilities`); module `facilities`, area-scoped through `assets.location_id` (always set; a facility's asset carries the facility's place, and moving the facility moves them).
- Every asset change also writes an `asset_events` row in the same transaction (`AssetsService.event`); work orders (Step 24) add theirs the same way.
- Assets are never deleted: retire or lose them (`facilities.approve`, `assetStatusMoves` in shared).
- Asset numbers come from `NumberingService` kind `asset` (`AST-NNNN`, never restarts).
- Anything new that counts upkeep uses `monthsAfter` / `upkeepState` from shared.
