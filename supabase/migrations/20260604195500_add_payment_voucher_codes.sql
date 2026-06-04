ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS payment_voucher_code TEXT,
  ADD COLUMN IF NOT EXISTS payment_voucher_generated_at TIMESTAMP WITH TIME ZONE;

CREATE SEQUENCE IF NOT EXISTS public.payment_voucher_code_seq;

CREATE OR REPLACE FUNCTION public.next_payment_voucher_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN 'PV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.payment_voucher_code_seq')::text, 6, '0');
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_payment_voucher_code_unique
  ON public.claims(payment_voucher_code)
  WHERE payment_voucher_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_payment_voucher_code(target_claim_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_code TEXT;
  generated_code TEXT;
BEGIN
  SELECT payment_voucher_code
  INTO existing_code
  FROM public.claims
  WHERE claim_id = target_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim % not found', target_claim_id;
  END IF;

  IF existing_code IS NOT NULL AND length(trim(existing_code)) > 0 THEN
    RETURN existing_code;
  END IF;

  LOOP
    generated_code := public.next_payment_voucher_code();
    BEGIN
      UPDATE public.claims
      SET payment_voucher_code = generated_code,
          payment_voucher_generated_at = now()
      WHERE claim_id = target_claim_id
        AND (payment_voucher_code IS NULL OR length(trim(payment_voucher_code)) = 0);

      RETURN generated_code;
    EXCEPTION WHEN unique_violation THEN
      -- Extremely unlikely, but keep trying if a historical/manual code collides.
    END;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
