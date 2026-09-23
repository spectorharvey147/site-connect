BEGIN;
-- Retain historical values while enforcing the ceiling on all new edits.
ALTER TABLE public.expense_items ADD CONSTRAINT approved_expense_not_above_submitted
 CHECK (approved_amount IS NULL OR approved_amount <= coalesce(amount_with_bill,0)+coalesce(amount_without_bill,0)) NOT VALID;
CREATE FUNCTION public.cap_claim_approved_amount() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.verified_amount IS NOT NULL AND (
   NEW.verified_amount < 0 OR NEW.verified_amount > coalesce(NEW.total_with_bill,0)+coalesce(NEW.total_without_bill,0)
   OR NEW.verified_amount <> round(NEW.verified_amount,2)
 ) THEN RAISE EXCEPTION 'Approved amount must not exceed submitted amount and must have at most two decimal places'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cap_claim_approved_amount BEFORE INSERT OR UPDATE OF verified_amount ON public.claims
 FOR EACH ROW EXECUTE FUNCTION public.cap_claim_approved_amount();
NOTIFY pgrst,'reload schema';
COMMIT;
