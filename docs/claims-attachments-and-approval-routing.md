# Claim routing, duplicate checks, and attachments

## Approval routing

Admin verification retains the manager stage for normal employee claims. If manager approval is enabled and the active assigned work manager is also the submitter, Admin verification records `manager_approval_status = 'Skipped'` and routes the claim to final HOD/Super Admin approval. The manager timeline entry and audit details explain the reason. The manager approval RPCs reject self-approval. Missing assignments, Super Admin assignments, and disabled manager approval keep their existing skip behavior.

The assignment check uses the claim's saved work manager and does not infer assignment from the submitter's role alone. Historical claims are not rewritten by the migration.

## Duplicate expenses

An expense fingerprint includes the ISO date, trimmed and case-insensitive category, trimmed and case-insensitive project code, and the total amount converted to integer paise. The browser checks rows in the current submission and previously submitted non-rejected claims. A database trigger applies the same comparison to inserted or edited rows so direct API writes use the same rule. Rejected claims are ignored for comparison.

## Claim attachments

Each with-bill expense row requires a file attached to that row. The optional claim-level upload remains available for general supporting documents and does not silently satisfy a row bill requirement. Row attachments are saved first; newly selected files in general attachments are hashed with SHA-256 and resolve to the row's canonical storage path when the bytes match. Storage objects are not deleted as part of deduplication. Existing path references are deduplicated in claim history and voucher export.

The uploader accepts PDF, PNG, and JPEG. WebP and HEIC/HEIF are not accepted, so the voucher exporter does not promise conversion support for them. Image type is detected from the downloaded bytes rather than the filename. Images are decoded into an orientation-corrected PNG for the PDF; PDF attachments keep all source pages. A failed download, decode, or page validation stops the export and identifies the failed filename.

Voucher rendering waits for logo and signature images, inlines remote image data before canvas capture, and checks the reopened merged PDF page count before offering the download.

## Migration and verification

Apply the new migration `20261117055612_claim_duplicate_self_approval.sql` after the existing schema migrations. The duplicate-check and manager self-approval migration has been applied to the configured Supabase project. It adds database enforcement without updating historical expense rows.

The app type check passed. The full suite passed with 106 tests across 12 files. The Vite production build completed. Browser-based end-to-end PDF export and live database migration validation remain unavailable in this workspace.
