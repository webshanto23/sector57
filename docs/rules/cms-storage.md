# Content CMS and file storage (Step 7)

## Public images

- Store uploads only through `MediaService` (`src/storage`): `saveImage(societyId, area, buffer)` checks, re-encodes (WebP, max 1600 px, no EXIF) and keys files `<society>/<area>/<uuid>.webp` with a `.thumb.webp`; `removeQuietly` deletes after the DB change commits.
- Routes take files with `@ImageUpload()` + `requireUpload(file)`. Non-image documents need their own check next to `processImage`.
- `MEDIA_DIR`, `MEDIA_SERVE` and `MEDIA_BASE_URL` configure storage; dev needs `MEDIA_BASE_URL=http://localhost:3000/api/media`. On the droplet Nginx serves `MEDIA_DIR` at `/media/`.

## Private files

- Documents that must not be public (deeds, NID copies, expense vouchers, library documents) go through `PrivateFilesService` (`src/storage`) into `PRIVATE_MEDIA_DIR`, which must stay outside `MEDIA_DIR`, with a `documents` row. Serve them only from a permission-checked route, never statically.

## CMS

- Dashboard saves that change public content call `refreshPublicSite()` (via `components/cms/use-save.ts`), so the site updates at once.
- Editable site pages are listed in `EDITABLE_PAGES` / `pageContentSchemas` (shared); a new page needs an entry there and an editor under `components/cms/pages`.
- Fields that are the same in both languages sit beside `bn`/`en` in the page content (e.g. home `heroAlbumId`); editors pass them as `shared` to `useLocalizedPage`.
- The home hero slider shows a gallery album chosen in the home editor (`heroAlbumId`), its first `HERO_SLIDES_MAX` photos in gallery order. No upload code of its own: images are managed in the gallery. Saving checks the album belongs to the society; the public page draws the illustration while the album is missing, unpublished or empty, and per photo whose file fails to load.
