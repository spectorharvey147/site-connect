BEGIN;

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
   -- This transaction-local flag is set only by the token-checked admin RPC below.
   IF current_setting('siteconnect.claim_work_correction',true)='true' THEN RETURN NEW; END IF;
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
   IF OLD.status IN ('Admin Verified','Pending Manager Approval') AND NEW.status IN ('Manager Approved','Rejected')
      AND lower(coalesce(OLD.user_email,''))=lower(coalesce(OLD.manager_email,''))
      AND public.app_current_role()='Manager' AND lower(public.app_current_email())=lower(OLD.user_email)
      AND EXISTS(SELECT 1 FROM public.users WHERE lower(email)=lower(OLD.user_email) AND active AND role='Manager') THEN
     RAISE EXCEPTION 'A manager cannot act on their own claim';
   END IF;
   IF OLD.status IN ('Submitted','Pending Admin Verification') AND NEW.status NOT IN (OLD.status,'Admin Verified','Rejected') AND NOT(skip_manager AND NEW.status='Manager Approved') THEN RAISE EXCEPTION 'Work claims require admin verification followed by manager approval when a manager is assigned'; END IF;
   IF OLD.status IN ('Admin Verified','Pending Manager Approval') AND NEW.status NOT IN (OLD.status,'Manager Approved','Rejected') THEN RAISE EXCEPTION 'Work claims require manager approval'; END IF;
   IF OLD.status IN ('Admin Verified','Pending Manager Approval') AND NEW.status IN ('Manager Approved','Rejected') AND NOT skip_manager AND current_setting('siteconnect.work_manager',true) IS DISTINCT FROM OLD.manager_email THEN RAISE EXCEPTION 'Sign in as the assigned work manager to perform this action'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.admin_correct_pending_claim_work(p_token TEXT,p_claim_id TEXT,p_work_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor TEXT; actor_role TEXT; c RECORD; selected_work RECORD;
BEGIN
 SELECT u.email,u.role INTO actor,actor_role
 FROM public.sessions s JOIN public.users u ON lower(u.email)=lower(s.user_email)
 WHERE s.token=p_token AND s.expires_at>now() AND u.active;
 IF actor IS NULL OR actor_role NOT IN ('Admin','Super Admin') THEN RAISE EXCEPTION 'Only Admin or Super Admin can correct work during verification'; END IF;

 SELECT * INTO c FROM public.claims WHERE claim_id=p_claim_id FOR UPDATE;
 IF NOT FOUND OR c.status NOT IN ('Submitted','Pending Admin Verification') THEN RAISE EXCEPTION 'Work can only be corrected while the claim is pending Admin verification'; END IF;
 SELECT w.id,w.name,coalesce(nullif(w.manager_email,''),nullif(p.default_manager_email,'')) manager_email
 INTO selected_work
 FROM public.project_works w JOIN public.app_lists p ON p.id=w.project_id
 WHERE w.id=p_work_id AND w.active AND p.active AND p.type='project' AND p.value=c.site_name;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active work for this claim project'; END IF;
 IF selected_work.manager_email IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.users WHERE lower(email)=lower(selected_work.manager_email) AND active AND role IN ('Manager','Super Admin')
 ) THEN RAISE EXCEPTION 'The selected work has no active Manager or Super Admin'; END IF;

 PERFORM set_config('siteconnect.claim_work_correction','true',true);
 UPDATE public.claims SET work_id=selected_work.id,work_name=selected_work.name,manager_email=selected_work.manager_email
 WHERE claim_id=p_claim_id;
 INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
 VALUES('claim_work_corrected',actor,'claim',p_claim_id,jsonb_build_object(
   'previous_work_id',c.work_id,'previous_work_name',c.work_name,'previous_manager_email',c.manager_email,
   'work_id',selected_work.id,'work_name',selected_work.name,'manager_email',selected_work.manager_email
 )::text);
END $$;

REVOKE ALL ON FUNCTION public.admin_correct_pending_claim_work(TEXT,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_correct_pending_claim_work(TEXT,TEXT,UUID) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
