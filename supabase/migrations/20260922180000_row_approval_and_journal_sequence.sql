BEGIN;
ALTER TABLE public.expense_items ADD COLUMN approved_amount NUMERIC;
ALTER TABLE public.expense_items ADD CONSTRAINT expense_approved_amount_valid
  CHECK (approved_amount IS NULL OR (approved_amount >= 0 AND approved_amount < 1000000000000 AND approved_amount = round(approved_amount, 2)));

-- New numbers start at 100000. Reservations can leave gaps after cancelled exports.
DO $$
DECLARE current_id BIGINT;
BEGIN
  SELECT last_value INTO current_id FROM public.sap_journal_id_seq;
  IF current_id < 100000 THEN PERFORM setval('public.sap_journal_id_seq', 100000, false); END IF;
END $$;
ALTER SEQUENCE public.sap_journal_id_seq MAXVALUE 999999 NO CYCLE;
CREATE OR REPLACE FUNCTION public.reserve_sap_journal_ids(p_token TEXT, p_count INTEGER) RETURNS SETOF BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE candidate BIGINT; reserved INTEGER := 0;
BEGIN
  PERFORM public.require_finance_session(p_token);
  IF p_count IS NULL OR p_count < 1 OR p_count > 10000 THEN RAISE EXCEPTION 'Invalid journal count'; END IF;
  WHILE reserved < p_count LOOP
    candidate := nextval('public.sap_journal_id_seq');
    IF NOT EXISTS (
      SELECT 1 FROM public.sap_export_batches b,
      LATERAL jsonb_array_elements(b.export_payload->'headers') WITH ORDINALITY h(row_value, row_number)
      WHERE h.row_number > 2 AND h.row_value->>0 = candidate::text
    ) THEN
      reserved := reserved + 1;
      RETURN NEXT candidate;
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.approve_claim_expense_rows(
  p_token TEXT, p_claim_id TEXT, p_stage TEXT, p_expected_status TEXT,
  p_amounts JSONB, p_expected_total NUMERIC, p_skip_manager BOOLEAN DEFAULT false, p_note TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor TEXT; actor_role TEXT; c public.claims%ROWTYPE; entry RECORD;
  approved NUMERIC; total NUMERIC := 0; expense_count INTEGER; skip_manager BOOLEAN := false;
  old_rows JSONB;
BEGIN
  SELECT u.email,u.role INTO actor,actor_role FROM public.sessions s JOIN public.users u ON u.email=s.user_email
  WHERE s.token=p_token AND s.expires_at>now() AND u.active;
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to approve expense rows'; END IF;
  SELECT * INTO c FROM public.claims WHERE claim_id=p_claim_id FOR UPDATE;
  IF NOT FOUND OR c.status IS DISTINCT FROM p_expected_status OR c.sap_exported OR c.paid_date IS NOT NULL THEN
    RAISE EXCEPTION 'Claim changed or is already exported. Refresh before approving';
  END IF;
  IF p_stage='admin' THEN
    IF actor_role NOT IN ('Admin','Super Admin') OR c.status NOT IN ('Submitted','Pending Admin Verification') THEN RAISE EXCEPTION 'Admin verification is not available'; END IF;
    skip_manager := c.work_id IS NULL AND (
      NOT coalesce((SELECT require_manager_approval FROM public.company_settings LIMIT 1),true)
      OR nullif(trim(c.manager_email),'') IS NULL
      OR EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(c.manager_email) AND role='Super Admin')
    );
    IF skip_manager IS DISTINCT FROM p_skip_manager THEN RAISE EXCEPTION 'Approval routing changed. Refresh the claim'; END IF;
    IF c.work_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE email=c.manager_email AND active AND role IN ('Manager','Super Admin')) THEN RAISE EXCEPTION 'The assigned manager is inactive'; END IF;
  ELSIF p_stage='manager' THEN
    IF actor_role NOT IN ('Manager','Super Admin') OR lower(actor) IS DISTINCT FROM lower(c.manager_email)
       OR c.status NOT IN ('Admin Verified','Pending Manager Approval') THEN RAISE EXCEPTION 'Only the assigned manager can approve this claim'; END IF;
    PERFORM set_config('siteconnect.work_manager',c.manager_email,true);
  ELSIF p_stage='super-admin' THEN
    IF actor_role <> 'Super Admin' OR c.status NOT IN ('Manager Approved','Pending Super Admin Approval','Pending Admin Approval') THEN RAISE EXCEPTION 'Final approval is not available'; END IF;
  ELSIF p_stage='accounts' THEN
    IF actor_role NOT IN ('Accounts','Super Admin','Admin') OR c.status NOT IN ('Accounts Verification','Sent to Accounts') THEN RAISE EXCEPTION 'Accounts verification is not available'; END IF;
  ELSE RAISE EXCEPTION 'Invalid approval stage';
  END IF;
  IF p_amounts IS NULL OR jsonb_typeof(p_amounts)<>'object' THEN RAISE EXCEPTION 'Expense amounts are required'; END IF;
  PERFORM 1 FROM public.expense_items WHERE claim_id=p_claim_id FOR UPDATE;
  SELECT count(*), jsonb_object_agg(id::text,approved_amount) INTO expense_count,old_rows FROM public.expense_items WHERE claim_id=p_claim_id;
  IF expense_count=0 OR (SELECT count(*) FROM jsonb_object_keys(p_amounts))<>expense_count THEN RAISE EXCEPTION 'Supply an amount for every expense row'; END IF;
  FOR entry IN SELECT * FROM jsonb_each(p_amounts) LOOP
    IF jsonb_typeof(entry.value)<>'number' OR NOT EXISTS(SELECT 1 FROM public.expense_items WHERE claim_id=p_claim_id AND id::text=entry.key) THEN RAISE EXCEPTION 'Invalid expense row or amount'; END IF;
    approved := entry.value::text::numeric;
    IF approved<0 OR approved>=1000000000000 OR approved<>round(approved,2) THEN RAISE EXCEPTION 'Use non-negative amounts with at most two decimals'; END IF;
    total := total+approved;
  END LOOP;
  IF total IS DISTINCT FROM p_expected_total THEN RAISE EXCEPTION 'Approved total must equal the sum of expense rows'; END IF;
  UPDATE public.expense_items SET approved_amount=(p_amounts->>id::text)::numeric WHERE claim_id=p_claim_id;
  UPDATE public.claims SET verified_amount=total,
    status=CASE p_stage WHEN 'admin' THEN CASE WHEN skip_manager THEN 'Manager Approved' ELSE 'Admin Verified' END WHEN 'manager' THEN 'Manager Approved' WHEN 'super-admin' THEN 'Accounts Verification' ELSE 'Accounts Verified' END,
    manager_approval_status=CASE WHEN p_stage='manager' THEN 'Approved' WHEN p_stage='admin' THEN CASE WHEN skip_manager THEN 'Skipped' ELSE 'Pending' END ELSE manager_approval_status END,
    manager_approval_date=CASE WHEN p_stage='manager' THEN now() ELSE manager_approval_date END,
    admin_email=CASE WHEN p_stage='admin' THEN actor ELSE admin_email END,
    admin_approval_date=CASE WHEN p_stage='admin' THEN now() ELSE admin_approval_date END,
    final_approval_email=CASE WHEN p_stage='super-admin' THEN actor ELSE final_approval_email END,
    final_approval_date=CASE WHEN p_stage='super-admin' THEN now() ELSE final_approval_date END,
    accounts_verified_email=CASE WHEN p_stage='accounts' THEN actor ELSE accounts_verified_email END,
    accounts_verified_date=CASE WHEN p_stage='accounts' THEN now() ELSE accounts_verified_date END,
    accounts_note=CASE WHEN p_stage='accounts' THEN p_note ELSE accounts_note END
  WHERE claim_id=p_claim_id;
  INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
  VALUES('claim_expense_amounts_approved',actor,'claim',p_claim_id,jsonb_build_object('stage',p_stage,'previous',old_rows,'approved',p_amounts,'total',total,'note',p_note)::text);
END $$;
REVOKE ALL ON FUNCTION public.approve_claim_expense_rows(TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,BOOLEAN,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_claim_expense_rows(TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,BOOLEAN,TEXT) TO anon,authenticated;

-- Older clients cannot silently replace a row-approved total with a different total.
CREATE FUNCTION public.check_claim_approved_rows() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE row_count INTEGER; approved_count INTEGER; total NUMERIC;
BEGIN
  SELECT count(*),count(approved_amount),sum(approved_amount) INTO row_count,approved_count,total FROM public.expense_items WHERE claim_id=NEW.claim_id;
  IF approved_count>0 AND (approved_count<>row_count OR NEW.verified_amount IS DISTINCT FROM total) THEN RAISE EXCEPTION 'Correct the expense row amounts so their sum matches the final approved total'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_claim_approved_rows BEFORE UPDATE OF verified_amount,status ON public.claims FOR EACH ROW EXECUTE FUNCTION public.check_claim_approved_rows();
NOTIFY pgrst,'reload schema';
COMMIT;
