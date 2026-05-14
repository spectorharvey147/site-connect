-- Align a freshly rebuilt database with the current application contract.

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS profile_picture_url text,
ADD COLUMN IF NOT EXISTS employee_id text,
ADD COLUMN IF NOT EXISTS mobile_number text,
ADD COLUMN IF NOT EXISTS date_of_joining date;

ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS admin_description text,
ADD COLUMN IF NOT EXISTS manager_description text;

CREATE INDEX IF NOT EXISTS idx_users_manager_email ON public.users(manager_email);
CREATE INDEX IF NOT EXISTS idx_claims_manager_email ON public.claims(manager_email);
CREATE INDEX IF NOT EXISTS idx_claims_created_at ON public.claims(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON public.notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('claim-receipts', 'claim-receipts', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read claim-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload claim-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Allow update claim-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete claim-receipts" ON storage.objects;

CREATE POLICY "Public read claim-receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'claim-receipts');

CREATE POLICY "Allow upload claim-receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'claim-receipts');

CREATE POLICY "Allow update claim-receipts"
ON storage.objects FOR UPDATE
USING (bucket_id = 'claim-receipts')
WITH CHECK (bucket_id = 'claim-receipts');

CREATE POLICY "Allow delete claim-receipts"
ON storage.objects FOR DELETE
USING (bucket_id = 'claim-receipts');
