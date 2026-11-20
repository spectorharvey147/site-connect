-- SAP export is a prerequisite for payment; allow payment to settle exported claims.
CREATE OR REPLACE FUNCTION public.claim_approval_action(
  p_token text,p_claim_id text,p_stage text,p_action text,p_payload jsonb,
  p_client_ip inet DEFAULT NULL,p_user_agent text DEFAULT NULL,
  p_signature_snapshot_path text DEFAULT NULL,p_event_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_session jsonb; actor text; actor_role text; c public.claims%ROWTYPE; expected_status text;
  amount_total numeric; stage_skip boolean; row_amounts jsonb; accounting jsonb;
BEGIN
  actor_session:=public.app_session(p_token);
  actor:=actor_session->>'email'; actor_role:=actor_session->>'role';
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in again to approve this claim'; END IF;
  IF p_claim_id IS NULL OR length(p_claim_id)>160 OR p_stage IS NULL OR p_stage NOT IN ('admin','manager','super-admin','accounts','payment') OR p_action IS NULL OR p_action NOT IN ('approve','reject','paid') THEN RAISE EXCEPTION 'Invalid approval request'; END IF;
  IF p_action='paid' AND p_stage<>'payment' OR p_action='reject' AND p_stage='payment' OR p_action='approve' AND p_stage='payment' THEN RAISE EXCEPTION 'Invalid approval action'; END IF;
  SELECT * INTO c FROM public.claims WHERE claim_id=p_claim_id FOR UPDATE;
  IF NOT FOUND OR (p_action <> 'paid' AND c.sap_exported) OR c.paid_date IS NOT NULL THEN RAISE EXCEPTION 'Claim changed or is already settled'; END IF;
  expected_status:=p_payload->>'expectedStatus';
  IF expected_status IS NOT NULL AND c.status IS DISTINCT FROM expected_status THEN RAISE EXCEPTION 'Claim changed. Refresh before approving'; END IF;
  PERFORM set_config('siteconnect.approval_context','true',true);
  PERFORM set_config('siteconnect.approval_actor',actor,true);
  PERFORM set_config('siteconnect.approval_ip',coalesce(p_client_ip::text,''),true);
  PERFORM set_config('siteconnect.approval_user_agent',left(coalesce(p_user_agent,''),1000),true);
  PERFORM set_config('siteconnect.approval_signature_snapshot',coalesce(p_signature_snapshot_path,''),true);
  PERFORM set_config('siteconnect.approval_event_id',coalesce(p_event_id::text,gen_random_uuid()::text),true);

  IF p_action='paid' THEN
    IF actor_role NOT IN ('Accounts','Admin','Super Admin') OR c.status NOT IN ('Accounts Processing','Payment Processing') THEN RAISE EXCEPTION 'Only Accounts can mark a processing claim as paid'; END IF;
    amount_total:=nullif(p_payload->>'paidAmount','')::numeric;
    IF amount_total IS NULL OR amount_total<=0 OR amount_total<>round(amount_total,2) THEN RAISE EXCEPTION 'Paid amount must be positive with at most two decimal places'; END IF;
    UPDATE public.claims SET status='Paid',paid_email=actor,paid_date=now(),paid_amount=amount_total,
      payment_reference=nullif(left(p_payload->>'paymentReference',240),''),payment_note=nullif(left(p_payload->>'note',2000),'')
      WHERE claim_id=p_claim_id;
    RETURN;
  END IF;

  IF p_action='reject' THEN
    IF p_stage='manager' THEN
      IF actor_role NOT IN ('Manager','Super Admin') OR lower(actor)<>lower(c.manager_email) OR lower(actor)=lower(c.user_email) OR c.status NOT IN ('Admin Verified','Pending Manager Approval') THEN RAISE EXCEPTION 'Only the assigned manager may reject another claimant’s claim'; END IF;
      IF c.work_id IS NOT NULL THEN PERFORM set_config('siteconnect.work_manager',c.manager_email,true); END IF;
      UPDATE public.claims SET status='Rejected',manager_approval_status='Rejected',manager_approval_date=now(),rejection_reason=left(p_payload->>'note',2000) WHERE claim_id=p_claim_id;
    ELSIF p_stage='admin' THEN
      IF actor_role NOT IN ('Admin','Super Admin') OR c.status NOT IN ('Submitted','Pending Admin Verification') THEN RAISE EXCEPTION 'Admin rejection is not available'; END IF;
      UPDATE public.claims SET status='Rejected',admin_email=actor,admin_approval_date=now(),rejection_reason=left(p_payload->>'note',2000) WHERE claim_id=p_claim_id;
    ELSE
      IF actor_role<>'Super Admin' OR c.status NOT IN ('Manager Approved','Pending Super Admin Approval','Pending Admin Approval') THEN RAISE EXCEPTION 'Final rejection is not available'; END IF;
      UPDATE public.claims SET status='Rejected',final_approval_email=actor,final_approval_date=now(),rejection_reason=left(p_payload->>'note',2000) WHERE claim_id=p_claim_id;
    END IF;
    RETURN;
  END IF;

  row_amounts:=p_payload->'amounts'; accounting:=p_payload->'accountingRows';
  IF row_amounts IS NOT NULL AND jsonb_typeof(row_amounts)='object' THEN
    amount_total:=nullif(p_payload->>'expectedTotal','')::numeric;
    IF p_stage='accounts' AND accounting IS NOT NULL THEN
      PERFORM public.verify_claim_accounting_rows(p_token,p_claim_id,expected_status,row_amounts,amount_total,accounting,nullif(p_payload->>'note',''));
    ELSE
      PERFORM public.approve_claim_expense_rows(p_token,p_claim_id,p_stage,expected_status,row_amounts,amount_total,coalesce((p_payload->>'skipManager')::boolean,false),nullif(p_payload->>'note',''));
    END IF;
    RETURN;
  END IF;

  amount_total:=nullif(p_payload->>'verifiedAmount','')::numeric;
  IF amount_total IS NULL OR amount_total<0 OR amount_total<>round(amount_total,2) THEN RAISE EXCEPTION 'Enter a valid verified amount'; END IF;
  IF p_stage='admin' THEN
    IF actor_role NOT IN ('Admin','Super Admin') OR c.status NOT IN ('Submitted','Pending Admin Verification') THEN RAISE EXCEPTION 'Admin verification is not available'; END IF;
    stage_skip:=NOT coalesce((SELECT require_manager_approval FROM public.company_settings LIMIT 1),true)
      OR nullif(trim(coalesce(c.manager_email,'')),'') IS NULL
      OR EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(c.manager_email) AND active AND role='Super Admin')
      OR (lower(coalesce(c.user_email,''))=lower(coalesce(c.manager_email,'')) AND EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(c.user_email) AND active AND role='Manager'));
    IF NOT stage_skip AND NOT EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(c.manager_email) AND active AND role IN ('Manager','Super Admin')) THEN RAISE EXCEPTION 'The assigned manager is inactive'; END IF;
    UPDATE public.claims SET status=CASE WHEN stage_skip THEN 'Manager Approved' ELSE 'Admin Verified' END,
      manager_approval_status=CASE WHEN stage_skip THEN 'Skipped' ELSE 'Pending' END,
      manager_approval_date=CASE WHEN stage_skip THEN now() ELSE manager_approval_date END,
      admin_email=actor,admin_approval_date=now(),verified_amount=amount_total WHERE claim_id=p_claim_id;
  ELSIF p_stage='manager' THEN
    IF actor_role NOT IN ('Manager','Super Admin') OR lower(actor)<>lower(c.manager_email) OR lower(actor)=lower(c.user_email) OR c.status NOT IN ('Admin Verified','Pending Manager Approval') THEN RAISE EXCEPTION 'Only the assigned manager can approve another claimant’s claim'; END IF;
    IF c.work_id IS NOT NULL THEN
      PERFORM public.act_on_work_claim(p_token,p_claim_id,true,amount_total,nullif(p_payload->>'note',''));
    ELSE
      UPDATE public.claims SET status='Manager Approved',manager_approval_status='Approved',manager_approval_date=now(),verified_amount=amount_total,manager_description=nullif(left(p_payload->>'note',2000),'') WHERE claim_id=p_claim_id;
    END IF;
  ELSIF p_stage='super-admin' THEN
    IF actor_role<>'Super Admin' OR c.status NOT IN ('Manager Approved','Pending Super Admin Approval','Pending Admin Approval') THEN RAISE EXCEPTION 'Final approval is not available'; END IF;
    UPDATE public.claims SET status='Accounts Verification',final_approval_email=actor,final_approval_date=now(),verified_amount=amount_total,admin_description=nullif(left(p_payload->>'note',2000),'') WHERE claim_id=p_claim_id;
  ELSIF p_stage='accounts' THEN
    IF actor_role NOT IN ('Accounts','Admin','Super Admin') OR c.status NOT IN ('Accounts Verification','Sent to Accounts') THEN RAISE EXCEPTION 'Accounts verification is not available'; END IF;
    UPDATE public.claims SET status='Accounts Verified',accounts_verified_email=actor,accounts_verified_date=now(),accounts_note=nullif(left(p_payload->>'note',2000),''),verified_amount=amount_total WHERE claim_id=p_claim_id;
  END IF;
END $$;
