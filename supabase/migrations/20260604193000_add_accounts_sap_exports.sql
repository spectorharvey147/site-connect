ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS sap_exported BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sap_exported_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS sap_exported_by TEXT,
  ADD COLUMN IF NOT EXISTS sap_export_batch_id TEXT;

CREATE TABLE IF NOT EXISTS public.sap_export_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL UNIQUE,
  generated_by TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total_claims INTEGER NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  file_url TEXT,
  file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sap_export_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL REFERENCES public.sap_export_batches(batch_id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES public.claims(claim_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(batch_id, claim_id)
);

CREATE INDEX IF NOT EXISTS idx_claims_sap_pending
  ON public.claims(status, sap_exported)
  WHERE status = 'Accounts Verified';

CREATE INDEX IF NOT EXISTS idx_claims_sap_batch
  ON public.claims(sap_export_batch_id);

CREATE INDEX IF NOT EXISTS idx_sap_export_items_batch
  ON public.sap_export_batch_items(batch_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('sap-exports', 'sap-exports', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read sap-exports'
  ) THEN
    CREATE POLICY "Public read sap-exports" ON storage.objects
      FOR SELECT USING (bucket_id = 'sap-exports');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow upload sap-exports'
  ) THEN
    CREATE POLICY "Allow upload sap-exports" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'sap-exports');
  END IF;
END $$;
