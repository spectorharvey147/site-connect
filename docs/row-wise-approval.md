# Row-wise approval and sequential journals

The approval editor retains category, project code, date, description/remarks, with-bill and without-bill amounts, bill references and submitted totals on desktop and mobile. Final approved amounts appear alongside these details. Each approved row must be no greater than its submitted amount, even if the overall claim total would still be lower. Apply `20260922190000_cap_approved_expense_amounts.sql` after the row-approval migration to enforce both row and claim ceilings in the database. Historical excess values are retained but cannot be newly saved. `scripts/tests/approval-cap-assertions.sql` verifies rejection and rollback against the disposable test database.

Apply `supabase/migrations/20260922180000_row_approval_and_journal_sequence.sql` after the work-allocation migration. The local code is ready, but the hosted database must receive this migration before row approval or sequential SAP export can succeed. There is no silent fallback to an unsaved approval.

Each approval screen saves the corrected expense amounts, their sum, approval stage and audit record in one database transaction. Original submitted amounts remain unchanged. Admin, assigned manager, final approver and accounts can review the rows. Email approval links require sign-in and an explicit review rather than automatic approval.

The final approved total is calculated in cents. Blank, negative, non-finite and excess-decimal inputs are rejected. Existing approved rows retain zero amounts. A legacy claim with a reduced total but no row allocation requires explicit allocation instead of defaulting back to submitted amounts.

SAP uses `verified_amount` as its total, falling back to the submitted total only for legacy claims with no approved total. Saved row approvals populate its expense lines. SAP cannot override saved row approvals. The main abstract and import files are generated from the same balanced journal amounts.

JDTnum and ParentKey use the same reserved database sequence number, starting at 100000, capped at 999999. Existing random numbers in saved batches are skipped. Concurrent calls reserve distinct values; abandoned or failed exports can leave gaps. Re-downloading a saved batch retains its identifiers.

Validation: run the expense-approval and SAP Vitest suites. For database tests, use a disposable empty local PostgreSQL database and run, in order: `scripts/tests/sap-work-bootstrap.sql`, `scripts/tests/row-approval-bootstrap.sql`, the work-allocation migration, the new approval migration and `scripts/tests/row-approval-assertions.sql`, with `psql -v ON_ERROR_STOP=1`.
