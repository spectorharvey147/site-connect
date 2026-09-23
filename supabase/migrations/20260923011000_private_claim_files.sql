BEGIN;
CREATE TABLE IF NOT EXISTS public.storage_upload_owners(bucket text NOT NULL,prefix text NOT NULL,user_email text NOT NULL,PRIMARY KEY(bucket,prefix));
ALTER TABLE public.storage_upload_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_upload_owners FROM anon,authenticated;
DO $$ DECLARE p record;
BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' LOOP
  EXECUTE format('DROP POLICY %I ON storage.objects',p.policyname);
 END LOOP;
END $$;
UPDATE storage.buckets SET public=false WHERE id IN ('claim-attachments','claim-receipts','sap-exports');
CREATE POLICY public_brand_images ON storage.objects FOR SELECT USING (bucket_id IN ('company-assets','user-avatars'));
-- File operations now pass through storage-access, which verifies the app session and claim ownership.
COMMIT;
