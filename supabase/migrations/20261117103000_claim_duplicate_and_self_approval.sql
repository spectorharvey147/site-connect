BEGIN;

-- Keep the work assignment checks while allowing admin verification to route a
-- self-submitted Manager claim directly to the final approver.
CREATE OR REPLACE FUNCTION public.enforce_claim_work() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE work_record RECORD; skip_manager BOOLEAN := false;
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.work_id IS NULL THEN
     IF EXISTS(SELECT 1 FROM public.company_settings WHERE require_work_allocation) THEN RAISE EXCEPTION 'Select the project work before submitting'; END IF;
     RETURN NEW;
   END IF;
   SELECT w.name,p.value project_name,nullif(coalesce(w.manager_email,p.default_manager_email),'') manager
   INTO work_record FROM public.project_works w JOIN public.app_lists p ON p.id=w.project_id
   WHERE w.id=NEW.work_id AND w.active AND p.active AND p.type='project';
   IF NOT FOUND OR work_record.project_name<>NEW.site_name THEN RAISE EXCEPTION 'Choose an active work for this project'; END IF;
   IF work_record.manager IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(work_record.manager) AND active AND role IN ('Manager','Super Admin')) THEN RAISE EXCEPTION 'The work manager is inactive'; END IF;
   NEW.work_name:=work_record.name; NEW.manager_email:=work_record.manager; NEW.status:='Submitted'; NEW.manager_approval_status:='Not Started';
 ELSIF OLD.work_id IS NOT NULL THEN
   IF NEW.work_id IS DISTINCT FROM OLD.work_id OR NEW.manager_email IS DISTINCT FROM OLD.manager_email OR NEW.site_name IS DISTINCT FROM OLD.site_name OR NEW.work_name IS DISTINCT FROM OLD.work_name THEN RAISE EXCEPTION 'Submitted work and manager cannot be changed'; END IF;
   skip_manager:=NOT coalesce((SELECT require_manager_approval FROM public.company_settings LIMIT 1),true)
     OR nullif(trim(coalesce(OLD.manager_email,'')),'') IS NULL
     OR EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(OLD.manager_email) AND active AND role='Super Admin')
     OR (coalesce((SELECT require_manager_approval FROM public.company_settings LIMIT 1),true)
       AND lower(coalesce(OLD.user_email,''))=lower(coalesce(OLD.manager_email,''))
       AND EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(OLD.user_email) AND active AND role='Manager'));
   IF OLD.status IN ('Submitted','Pending Admin Verification') AND NEW.status='Admin Verified' AND skip_manager THEN
     NEW.status:='Manager Approved'; NEW.manager_approval_status:='Skipped'; NEW.manager_approval_date:=coalesce(NEW.manager_approval_date,now());
   END IF;
   IF OLD.status IN ('Admin Verified','Pending Manager Approval')
      AND NEW.status IN ('Manager Approved','Rejected')
      AND lower(coalesce(OLD.user_email,''))=lower(coalesce(OLD.manager_email,''))
      AND public.app_current_role()='Manager'
      AND lower(public.app_current_email())=lower(OLD.user_email)
      AND EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(OLD.user_email) AND active AND role='Manager') THEN
     RAISE EXCEPTION 'A manager cannot act on their own claim';
   END IF;
   IF OLD.status IN ('Submitted','Pending Admin Verification') AND NEW.status NOT IN (OLD.status,'Admin Verified','Rejected') AND NOT(skip_manager AND NEW.status='Manager Approved') THEN RAISE EXCEPTION 'Work claims require admin verification followed by manager approval when a manager is assigned'; END IF;
   IF OLD.status IN ('Admin Verified','Pending Manager Approval') AND NEW.status NOT IN (OLD.status,'Manager Approved','Rejected') THEN RAISE EXCEPTION 'Work claims require manager approval'; END IF;
   IF OLD.status IN ('Admin Verified','Pending Manager Approval') AND NEW.status IN ('Manager Approved','Rejected') AND NOT skip_manager AND current_setting('siteconnect.work_manager',true) IS DISTINCT FROM OLD.manager_email THEN RAISE EXCEPTION 'Sign in as the assigned work manager to perform this action'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.approve_claim_expense_rows(
 p_token TEXT,p_claim_id TEXT,p_stage TEXT,p_expected_status TEXT,p_amounts JSONB,p_expected_total NUMERIC,
 p_skip_manager BOOLEAN DEFAULT false,p_note TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor TEXT; actor_role TEXT; c public.claims%ROWTYPE; entry RECORD; approved NUMERIC; total NUMERIC:=0;
 expense_count INTEGER; skip_manager BOOLEAN:=false; old_rows JSONB;
 skip_reason TEXT:='Manager approval automatically skipped because the claim was submitted by the assigned project manager.';
BEGIN
 SELECT u.email,u.role INTO actor,actor_role FROM public.sessions s JOIN public.users u ON u.email=s.user_email WHERE s.token=p_token AND s.expires_at>now() AND u.active;
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to approve expense rows'; END IF;
 SELECT * INTO c FROM public.claims WHERE claim_id=p_claim_id FOR UPDATE;
 IF NOT FOUND OR c.status IS DISTINCT FROM p_expected_status OR c.sap_exported OR c.paid_date IS NOT NULL THEN RAISE EXCEPTION 'Claim changed or is already exported. Refresh before approving'; END IF;
 IF p_stage='admin' THEN
   IF actor_role NOT IN ('Admin','Super Admin') OR c.status NOT IN ('Submitted','Pending Admin Verification') THEN RAISE EXCEPTION 'Admin verification is not available'; END IF;
   skip_manager:=NOT coalesce((SELECT require_manager_approval FROM public.company_settings LIMIT 1),true)
     OR nullif(trim(coalesce(c.manager_email,'')),'') IS NULL
     OR EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(c.manager_email) AND active AND role='Super Admin')
     OR (coalesce((SELECT require_manager_approval FROM public.company_settings LIMIT 1),true)
       AND lower(coalesce(c.user_email,''))=lower(coalesce(c.manager_email,''))
       AND EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(c.user_email) AND active AND role='Manager'));
   IF skip_manager IS DISTINCT FROM p_skip_manager THEN RAISE EXCEPTION 'Approval routing changed. Refresh the claim'; END IF;
   IF NOT skip_manager AND NOT EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(c.manager_email) AND active AND role IN ('Manager','Super Admin')) THEN RAISE EXCEPTION 'The assigned manager is inactive'; END IF;
 ELSIF p_stage='manager' THEN
   IF actor_role NOT IN ('Manager','Super Admin') OR lower(actor) IS DISTINCT FROM lower(c.manager_email) OR lower(actor) IS NOT DISTINCT FROM lower(c.user_email)
      OR c.status NOT IN ('Admin Verified','Pending Manager Approval') THEN RAISE EXCEPTION 'Only the assigned manager can approve another claimant’s claim'; END IF;
   PERFORM set_config('siteconnect.work_manager',c.manager_email,true);
 ELSIF p_stage='super-admin' THEN
   IF actor_role<>'Super Admin' OR c.status NOT IN ('Manager Approved','Pending Super Admin Approval','Pending Admin Approval') THEN RAISE EXCEPTION 'Final approval is not available'; END IF;
 ELSIF p_stage='accounts' THEN
   IF actor_role NOT IN ('Accounts','Super Admin','Admin') OR c.status NOT IN ('Accounts Verification','Sent to Accounts') THEN RAISE EXCEPTION 'Accounts verification is not available'; END IF;
 ELSE RAISE EXCEPTION 'Invalid approval stage'; END IF;
 IF p_amounts IS NULL OR jsonb_typeof(p_amounts)<>'object' THEN RAISE EXCEPTION 'Expense amounts are required'; END IF;
 PERFORM 1 FROM public.expense_items WHERE claim_id=p_claim_id FOR UPDATE;
 SELECT count(*),count(approved_amount),jsonb_object_agg(id::text,approved_amount) INTO expense_count,approved,old_rows FROM public.expense_items WHERE claim_id=p_claim_id;
 IF expense_count=0 OR (SELECT count(*) FROM jsonb_object_keys(p_amounts))<>expense_count THEN RAISE EXCEPTION 'Supply an amount for every expense row'; END IF;
 FOR entry IN SELECT * FROM jsonb_each(p_amounts) LOOP
   IF jsonb_typeof(entry.value)<>'number' OR NOT EXISTS(SELECT 1 FROM public.expense_items WHERE claim_id=p_claim_id AND id::text=entry.key) THEN RAISE EXCEPTION 'Invalid expense row or amount'; END IF;
   approved:=entry.value::text::numeric;
   IF approved<0 OR approved>=1000000000000 OR approved<>round(approved,2) THEN RAISE EXCEPTION 'Use non-negative amounts with at most two decimals'; END IF;
   total:=total+approved;
 END LOOP;
 IF total IS DISTINCT FROM p_expected_total THEN RAISE EXCEPTION 'Approved total must equal the sum of expense rows'; END IF;
 UPDATE public.expense_items SET approved_amount=(p_amounts->>id::text)::numeric WHERE claim_id=p_claim_id;
 UPDATE public.claims SET verified_amount=total,
   status=CASE p_stage WHEN 'admin' THEN CASE WHEN skip_manager THEN 'Manager Approved' ELSE 'Admin Verified' END WHEN 'manager' THEN 'Manager Approved' WHEN 'super-admin' THEN 'Accounts Verification' ELSE 'Accounts Verified' END,
   manager_approval_status=CASE WHEN p_stage='manager' THEN 'Approved' WHEN p_stage='admin' THEN CASE WHEN skip_manager THEN 'Skipped' ELSE 'Pending' END ELSE manager_approval_status END,
   manager_approval_date=CASE WHEN p_stage='manager' THEN now() WHEN p_stage='admin' AND skip_manager THEN now() ELSE manager_approval_date END,
   admin_email=CASE WHEN p_stage='admin' THEN actor ELSE admin_email END,admin_approval_date=CASE WHEN p_stage='admin' THEN now() ELSE admin_approval_date END,
   final_approval_email=CASE WHEN p_stage='super-admin' THEN actor ELSE final_approval_email END,final_approval_date=CASE WHEN p_stage='super-admin' THEN now() ELSE final_approval_date END,
   accounts_verified_email=CASE WHEN p_stage='accounts' THEN actor ELSE accounts_verified_email END,accounts_verified_date=CASE WHEN p_stage='accounts' THEN now() ELSE accounts_verified_date END,
   accounts_note=CASE WHEN p_stage='accounts' THEN p_note ELSE accounts_note END WHERE claim_id=p_claim_id;
 INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
 VALUES('claim_expense_amounts_approved',actor,'claim',p_claim_id,jsonb_build_object('stage',p_stage,'previous',old_rows,'approved',p_amounts,'total',total,'note',p_note,'manager_skip_reason',CASE WHEN p_stage='admin' AND skip_manager AND coalesce((SELECT require_manager_approval FROM public.company_settings LIMIT 1),true) AND lower(coalesce(c.user_email,''))=lower(coalesce(c.manager_email,'')) AND EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(c.user_email) AND active AND role='Manager') THEN skip_reason ELSE NULL END)::text);
END $$;

CREATE OR REPLACE FUNCTION public.act_on_work_claim(p_token TEXT,p_claim_id TEXT,p_approve BOOLEAN,p_amount NUMERIC DEFAULT NULL,p_note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor TEXT; c RECORD;
BEGIN
 SELECT u.email INTO actor FROM public.sessions s JOIN public.users u ON u.email=s.user_email
 WHERE s.token=p_token AND s.expires_at>now() AND u.active AND u.role IN ('Manager','Super Admin');
 SELECT * INTO c FROM public.claims WHERE claim_id=p_claim_id FOR UPDATE;
 IF NOT FOUND OR c.work_id IS NULL OR actor IS NULL OR lower(actor) IS DISTINCT FROM lower(c.manager_email) THEN RAISE EXCEPTION 'Sign in as the manager assigned to this work'; END IF;
 IF lower(actor)=lower(c.user_email) THEN RAISE EXCEPTION 'A manager cannot approve their own claim'; END IF;
 IF c.status NOT IN ('Admin Verified','Pending Manager Approval') THEN RAISE EXCEPTION 'This claim is no longer awaiting manager approval'; END IF;
 IF p_approve AND (p_amount IS NULL OR p_amount<0 OR round(p_amount,2)<>p_amount) THEN RAISE EXCEPTION 'Enter a valid approved amount'; END IF;
 PERFORM set_config('siteconnect.work_manager',actor,true);
 UPDATE public.claims SET status=CASE WHEN p_approve THEN 'Manager Approved' ELSE 'Rejected' END,
  manager_approval_status=CASE WHEN p_approve THEN 'Approved' ELSE 'Rejected' END,manager_approval_date=now(),
  rejection_reason=CASE WHEN p_approve THEN rejection_reason ELSE p_note END,
  verified_amount=CASE WHEN p_approve THEN p_amount ELSE verified_amount END WHERE claim_id=p_claim_id;
END $$;
REVOKE ALL ON FUNCTION public.act_on_work_claim(TEXT,TEXT,BOOLEAN,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.act_on_work_claim(TEXT,TEXT,BOOLEAN,NUMERIC,TEXT) TO anon,authenticated;

-- Prevent duplicate row inserts through direct API/database paths. Claim submission
-- already serializes a user's ledger transaction; this lock also protects direct writes.
CREATE OR REPLACE FUNCTION public.reject_duplicate_claim_expense() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE claimant TEXT; fingerprint_date DATE; fingerprint_category TEXT; fingerprint_project TEXT; fingerprint_amount BIGINT;
BEGIN
 SELECT user_email INTO claimant FROM public.claims WHERE claim_id=NEW.claim_id;
 IF claimant IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('expense-dedupe:'||lower(claimant),0));
 fingerprint_date:=NEW.expense_date; fingerprint_category:=lower(trim(coalesce(NEW.category,'')));
 fingerprint_project:=lower(trim(coalesce(NEW.project_code,'')));
 fingerprint_amount:=round((coalesce(NEW.amount_with_bill,0)+coalesce(NEW.amount_without_bill,0))*100)::bigint;
 IF fingerprint_date IS NULL OR fingerprint_category='' OR fingerprint_amount<=0 THEN RETURN NEW; END IF;
 IF EXISTS(
   SELECT 1 FROM public.expense_items e JOIN public.claims c ON c.claim_id=e.claim_id
   WHERE c.user_email=claimant AND lower(c.status) NOT LIKE '%reject%'
     AND NOT(e.claim_id=NEW.claim_id AND e.id=NEW.id)
     AND e.expense_date=fingerprint_date AND lower(trim(coalesce(e.category,'')))=fingerprint_category
     AND lower(trim(coalesce(e.project_code,'')))=fingerprint_project
     AND round((coalesce(e.amount_with_bill,0)+coalesce(e.amount_without_bill,0))*100)::bigint=fingerprint_amount
 ) THEN RAISE EXCEPTION 'Possible duplicate expense: same date, category, project code, and amount already exist'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reject_duplicate_claim_expense ON public.expense_items;
DROP TRIGGER IF EXISTS reject_duplicate_claim_expense_update ON public.expense_items;
CREATE TRIGGER reject_duplicate_claim_expense BEFORE INSERT ON public.expense_items
FOR EACH ROW EXECUTE FUNCTION public.reject_duplicate_claim_expense();
CREATE TRIGGER reject_duplicate_claim_expense_update BEFORE UPDATE OF expense_date,category,project_code,amount_with_bill,amount_without_bill
ON public.expense_items FOR EACH ROW EXECUTE FUNCTION public.reject_duplicate_claim_expense();

-- The existing identity trigger records one stage per row update. A manager
-- self-skip changes both manager and admin timestamps in one transaction, so
-- add the Admin identity event explicitly for that combined update.
CREATE OR REPLACE FUNCTION public.capture_admin_identity_for_manager_skip() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE headers JSONB; actor TEXT; actor_user public.users%ROWTYPE; reason TEXT;
BEGIN
 IF NEW.admin_approval_date IS NOT DISTINCT FROM OLD.admin_approval_date
    OR NEW.manager_approval_date IS NOT DISTINCT FROM OLD.manager_approval_date
    OR NEW.manager_approval_status IS DISTINCT FROM 'Skipped' THEN RETURN NEW; END IF;
 actor:=coalesce(public.app_current_email(),NEW.admin_email);
 SELECT * INTO actor_user FROM public.users WHERE lower(email)=lower(actor) LIMIT 1;
 SELECT coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb INTO headers;
 IF coalesce((SELECT require_manager_approval FROM public.company_settings LIMIT 1),true)
    AND lower(coalesce(NEW.user_email,''))=lower(coalesce(NEW.manager_email,''))
    AND EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(NEW.user_email) AND active AND role='Manager') THEN
   reason:='Manager approval automatically skipped because the claim was submitted by the assigned project manager.';
 END IF;
 INSERT INTO public.claim_approval_events(claim_id,approval_stage,action,actor_email,actor_name,approved_at,user_agent,browser_name,operating_system,device_type,signature_snapshot_url,remarks)
 VALUES(NEW.claim_id,'Admin','Approved',actor,actor_user.name,NEW.admin_approval_date,nullif(headers->>'user-agent',''),
   CASE WHEN headers->>'user-agent' ILIKE '%Edg/%' THEN 'Edge' WHEN headers->>'user-agent' ILIKE '%Chrome/%' THEN 'Chrome' WHEN headers->>'user-agent' ILIKE '%Firefox/%' THEN 'Firefox' WHEN headers->>'user-agent' ILIKE '%Safari/%' THEN 'Safari' ELSE NULL END,
   CASE WHEN headers->>'user-agent' ILIKE '%Windows%' THEN 'Windows' WHEN headers->>'user-agent' ILIKE '%Android%' THEN 'Android' WHEN headers->>'user-agent' ILIKE '%iPhone%' OR headers->>'user-agent' ILIKE '%iPad%' THEN 'iOS' WHEN headers->>'user-agent' ILIKE '%Mac OS%' THEN 'macOS' WHEN headers->>'user-agent' ILIKE '%Linux%' THEN 'Linux' ELSE NULL END,
   CASE WHEN headers->>'user-agent' ILIKE '%Mobile%' OR headers->>'user-agent' ILIKE '%Android%' OR headers->>'user-agent' ILIKE '%iPhone%' THEN 'Mobile' WHEN headers->>'user-agent' ILIKE '%iPad%' OR headers->>'user-agent' ILIKE '%Tablet%' THEN 'Tablet' WHEN headers->>'user-agent' IS NOT NULL THEN 'Desktop' ELSE NULL END,
   actor_user.signature_url,reason)
 ON CONFLICT (claim_id,approval_stage,action) DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS capture_admin_identity_for_manager_skip ON public.claims;
CREATE TRIGGER capture_admin_identity_for_manager_skip AFTER UPDATE OF admin_approval_date ON public.claims
FOR EACH ROW EXECUTE FUNCTION public.capture_admin_identity_for_manager_skip();

NOTIFY pgrst,'reload schema';
COMMIT;
