# Documents library (Step 21)

- Library documents (society, person, location) go only through `DocumentsService` (`src/documents`); files through `PrivateFilesService` (area `documents`). Nothing is deleted; documents are archived.
- A person's or place's documents follow the members or units/locations grant on that record as well as `documents`; NID copies only for those who may edit the person.
- Form files and expense vouchers stay with their own routes and are never served by `/documents`.
