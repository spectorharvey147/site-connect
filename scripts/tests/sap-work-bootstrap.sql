-- Run only against a disposable, empty local PostgreSQL database.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE users(id uuid DEFAULT gen_random_uuid(),email text PRIMARY KEY,name text,role text,active boolean DEFAULT true);
CREATE TABLE sessions(token text,user_email text,expires_at timestamptz);
CREATE TABLE app_lists(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text,value text,active boolean DEFAULT true,project text,project_code text);
CREATE TABLE claims(claim_id text PRIMARY KEY,claim_number text,user_email text,site_name text,manager_email text,
 status text DEFAULT 'Submitted',manager_approval_status text,manager_approval_date timestamptz,rejection_reason text,total_with_bill numeric DEFAULT 0,total_without_bill numeric DEFAULT 0,
 grand_total numeric GENERATED ALWAYS AS (total_with_bill+total_without_bill) STORED,verified_amount numeric,
 sap_exported boolean DEFAULT false,sap_exported_at timestamptz,sap_exported_by text,sap_export_batch_id text);
CREATE TABLE audit_logs(action text,performed_by text,target_type text,target_id text,details text);
CREATE TABLE company_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
INSERT INTO company_settings DEFAULT VALUES;
CREATE TABLE sap_export_batches(batch_id text PRIMARY KEY,generated_by text,generated_at timestamptz DEFAULT now(),total_claims integer,total_amount numeric);
CREATE TABLE sap_export_batch_items(batch_id text REFERENCES sap_export_batches(batch_id),claim_id text REFERENCES claims(claim_id),UNIQUE(batch_id,claim_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON sap_export_batches,sap_export_batch_items TO anon,authenticated;
CREATE FUNCTION assign_payment_voucher_code(text) RETURNS text LANGUAGE sql AS $$ SELECT 'TEST-VOUCHER'::text $$;
