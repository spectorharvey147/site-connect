-- Extend sap-work-bootstrap.sql for approval tests in a disposable local DB only.
ALTER TABLE company_settings ADD COLUMN require_manager_approval boolean DEFAULT true;
ALTER TABLE claims ADD COLUMN paid_date timestamptz,
 ADD COLUMN admin_email text, ADD COLUMN admin_approval_date timestamptz,
 ADD COLUMN final_approval_email text, ADD COLUMN final_approval_date timestamptz,
 ADD COLUMN accounts_verified_email text, ADD COLUMN accounts_verified_date timestamptz,
 ADD COLUMN accounts_note text;
CREATE TABLE expense_items(id uuid PRIMARY KEY,claim_id text REFERENCES claims(claim_id),amount_with_bill numeric,amount_without_bill numeric);
