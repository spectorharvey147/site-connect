# Work allocation and SAP journal export

## Setup and rollout

1. Apply `supabase/migrations/20260920154750_work_allocation_and_sap_journals.sql` to the target database after the existing migrations. The new frontend requires work selection, while the migration initially preserves submissions and Excel-only exports from older deployed clients during localhost testing. After all clients are updated and initial work allocations are configured, set `company_settings.require_work_allocation` to `true` to enforce work selection for every client. Deploy the updated `send-notification` function with the frontend.
2. In **GL & Location Setup** (Admin, Super Admin or Accounts), enter employee GL codes, employee default locations, project locations, SAP project codes and category mappings. Employee accounts are entered as text, preserving leading zeros. No employees are matched/imported from the reference workbook automatically.
3. The migration seeds travel `4330900007`, DA `4310000007`, other expenses `4332000016` and boarding `4330900001`. It seeds locations 2–8. SAP distribution rules retain `Bangalor` and `Coimbato`; display names are Bangalore and Coimbatore. Confirm these exact distribution-rule values in the target SAP company.
4. In **Work Allocation** (Admin or Super Admin), select each project and assign its default manager. The first manager assignment creates **General work**. Rename this to the actual activity and add additional activities with manager overrides. A work without an override inherits the project manager. There is deliberately no guessed mapping from a user's reporting manager to a project.
5. Test one real Accounts-approved claim through the target SAP import tool before enabling routine uploads. No production database migration, deployment or SAP upload is performed by the local implementation tests.

## Claim workflow

A new claim has one project/site and one work activity. Its existing expense rows can retain different project cost codes and customers. Work must belong to the selected active project and resolve to an active Manager or Super Admin.

Submission snapshots work name and manager. New claims always start with Admin verification, followed by that manager, then the existing final approval and Accounts flow. Auto-approval and manager-skip settings do not bypass work approval. Historical claims without work keep their existing workflow. Rejected claims are copied into new submissions and must select current work.

Changing the project manager or work allocation affects future claims only. If a submitted claim's manager is deactivated, Admin forwarding is blocked until that manager is restored. A future reassignment feature would need a separate audited action.

The manager's approve/reject action for work claims uses a session-checked database function and locks the claim. Email links require signing in as the assigned manager and an explicit action. This change does not replace the application's existing custom authentication system or its broader legacy table-access policies.

## SAP files

Accounts selects eligible **Accounts Verified** claims and chooses **Generate SAP Excel & TXT**. The review screen exposes posting date, due date, transaction code (initially `IPI`), expense allocations and the GL/location preview.

Each journal groups a claim's expenses by internal project cost code, resolved SAP project code, customer, expense date and location. Different internal codes remain separate even when they map to `8020-Service`. Category mappings explicitly select one of the four expense GL groups. Nonzero expense groups are debits; employee GL is the balancing credit. Group line numbers follow the supplied reference: travel 1, DA 2, other 3, boarding 4, employee credit 5.

Location resolves from the project, then the employee. SAP project resolves from the cost-code override, then the parent project's SAP code, then the existing cost code. Accounts can set a common service project to `8020-Service` without replacing existing internal cost codes.

The original claim number (or internal ID if absent) is `Reference`. `Reference2` is a claim reference plus a three-digit journal part. Database-generated numeric journal IDs link header `JdtNum` to detail `ParentKey`; these are export identifiers, not SAP's posted document numbers. Gaps from interrupted export attempts are harmless.

The workbook has **OJDT - JournalEntries** and **JDT1** sheets with exactly the same rows as **Claim header.txt** and **Claim details.txt**. Both include the two reference header rows. Header width is 14, detail width is 7; there is no `U_Year`. Dates are `YYYYMMDD`; TXT uses UTF-8 without BOM, tabs and CRLF. `Indicator` is a single space and `U_Month` is blank, matching the TXT references. Embedded tabs/newlines in source fields are rejected rather than silently changing data.

If approved total differs from submitted expenses, Accounts explicitly allocates approved amounts across expense rows. Original expense amounts remain unchanged. Missing mappings, invalid dates/amounts, zero-total claims and unbalanced allocations block export.

Batch commit checks current approval amount and export eligibility under claim locks. It atomically stores journal rows, batch membership, claim status, voucher assignment and export audit records. Concurrent exports cannot include the same claim twice. Regenerated Excel/TXT downloads and the batch view use saved rows; later master edits do not change old exports. Older Excel-only batches retain their original download link. The historical spreadsheet preview remains a legacy summary, not an SAP import file.

## Verification

- Unit and UI tests: `node node_modules/vitest/vitest.mjs run`
- Production build: `node node_modules/vite/bin/vite.js build`
- New-module lint: run ESLint on `sap-journal.ts`, `accounting-api.ts`, the three new views and new tests.
- PostgreSQL integration: against an **empty disposable local database only**, run `scripts/tests/sap-work-bootstrap.sql`, the new migration, then `scripts/tests/sap-work-assertions.sql` with `psql -v ON_ERROR_STOP=1`. Bootstrap is a minimal legacy-schema fixture, not an application installation script.

Coverage includes three managers under one project, role restrictions, work-manager snapshots, blocked approval bypasses, wrong-manager actions, TXT shape, Excel/TXT equality, explicit allocations, decimal balancing, failed-batch rollback and duplicate export rejection.

The repository's standalone TypeScript check had existing failures before this change (payment voucher Blob typing, notification recipient inference and demo data typing). The production bundler and test suite run independently of that check.
