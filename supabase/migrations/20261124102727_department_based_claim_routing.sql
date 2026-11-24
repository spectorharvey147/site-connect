BEGIN;

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departments_name_key UNIQUE (name),
  CONSTRAINT departments_code_key UNIQUE (code),
  CONSTRAINT departments_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT departments_code_nonempty CHECK (length(trim(code)) > 0)
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE RESTRICT;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE RESTRICT;
GRANT SELECT (department_id) ON public.users TO anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_users_department_role_active ON public.users(department_id, role) WHERE active;
CREATE INDEX IF NOT EXISTS idx_claims_department_status_created ON public.claims(department_id, status, created_at DESC);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('User', 'Manager', 'Admin', 'Accounts', 'Super Admin', 'Master Admin'));
CREATE UNIQUE INDEX IF NOT EXISTS users_single_active_master_admin ON public.users ((active)) WHERE role = 'Master Admin' AND active;

CREATE OR REPLACE FUNCTION public.app_session(p_token text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('email',u.email,'name',u.name,'role',u.role,'department_id',u.department_id,'profile_picture_url',u.profile_picture_url,'signature_url',u.signature_url)
 FROM users u JOIN sessions s ON s.user_email=u.email
 WHERE s.token=p_token AND s.expires_at>now() AND u.active LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.app_current_department_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT nullif(public.app_session(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-claims-token')->>'department_id','')::uuid
$$;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS departments_read ON public.departments;
DROP POLICY IF EXISTS departments_write ON public.departments;
CREATE POLICY departments_read ON public.departments FOR SELECT USING (app_current_email() IS NOT NULL);
CREATE POLICY departments_insert ON public.departments FOR INSERT WITH CHECK (app_current_role()='Master Admin');
CREATE POLICY departments_update ON public.departments FOR UPDATE USING (app_current_role()='Master Admin') WITH CHECK (app_current_role()='Master Admin');
CREATE POLICY departments_delete ON public.departments FOR DELETE USING (app_current_role()='Master Admin');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO anon, authenticated;

DROP POLICY IF EXISTS users_read ON public.users;
CREATE POLICY users_read ON public.users FOR SELECT USING (
 email=app_current_email() OR app_current_role() IN ('Admin','Accounts','Master Admin') OR role IN ('Admin','Master Admin')
 OR (role='Super Admin' AND (department_id=app_current_department_id() OR department_id IS NULL))
 OR (department_id=app_current_department_id())
);

CREATE OR REPLACE FUNCTION public.set_claim_department_from_submitter() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_department uuid;
BEGIN
 SELECT department_id INTO owner_department FROM public.users WHERE lower(email)=lower(NEW.user_email) AND active;
 IF owner_department IS NULL OR NOT EXISTS(SELECT 1 FROM public.departments WHERE id=owner_department AND active) THEN
  RAISE EXCEPTION 'Ask your administrator to assign you to an active department before submitting a claim';
 END IF;
 IF NEW.department_id IS NOT NULL AND NEW.department_id IS DISTINCT FROM owner_department THEN
  RAISE EXCEPTION 'A claim must belong to the submitter department';
 END IF;
 NEW.department_id:=owner_department;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS claims_set_submitter_department ON public.claims;
CREATE TRIGGER claims_set_submitter_department BEFORE INSERT ON public.claims
FOR EACH ROW EXECUTE FUNCTION public.set_claim_department_from_submitter();

CREATE OR REPLACE FUNCTION public.backfill_claim_department_after_user_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.department_id IS NOT NULL AND OLD.department_id IS NULL THEN
  UPDATE public.claims SET department_id=NEW.department_id WHERE lower(user_email)=lower(NEW.email) AND department_id IS NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_backfill_claim_department ON public.users;
CREATE TRIGGER users_backfill_claim_department AFTER UPDATE OF department_id ON public.users
FOR EACH ROW EXECUTE FUNCTION public.backfill_claim_department_after_user_assignment();

CREATE OR REPLACE FUNCTION public.validate_user_manager_department() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE manager_department uuid;
BEGIN
 IF nullif(trim(coalesce(NEW.manager_email,'')),'') IS NULL THEN RETURN NEW; END IF;
 SELECT department_id INTO manager_department FROM public.users
 WHERE lower(email)=lower(NEW.manager_email) AND active AND role IN ('Manager','Super Admin');
 IF manager_department IS NULL OR NEW.department_id IS DISTINCT FROM manager_department THEN
  RAISE EXCEPTION 'Choose an active Manager or HOD Super Admin from the same department';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_validate_manager_department ON public.users;
CREATE TRIGGER users_validate_manager_department BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW WHEN (NEW.role='User') EXECUTE FUNCTION public.validate_user_manager_department();

CREATE OR REPLACE FUNCTION public.assign_users_to_manager(
 p_token text,p_user_emails text[],p_manager_email text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 actor jsonb:=public.app_session(p_token);
 manager_key text:=nullif(lower(trim(p_manager_email)),'');
 target_emails text[];
 affected integer:=0;
BEGIN
 IF actor IS NULL OR actor->>'role' NOT IN ('Admin','Super Admin','Master Admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 SELECT array_agg(DISTINCT lower(trim(value))) INTO target_emails
 FROM unnest(coalesce(p_user_emails,ARRAY[]::text[])) AS selected_email(value)
 WHERE nullif(trim(value),'') IS NOT NULL;
 IF coalesce(array_length(target_emails,1),0)=0 OR array_length(target_emails,1)>500 THEN RAISE EXCEPTION 'Select between 1 and 500 users'; END IF;
 IF manager_key IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.users WHERE lower(email)=manager_key AND active AND role IN ('Manager','Super Admin')
 ) THEN RAISE EXCEPTION 'Choose an active manager'; END IF;
 INSERT INTO public.user_manager_allocation_history(user_email,previous_manager_email,manager_email,assigned_by,action)
 SELECT u.email,nullif(lower(trim(u.manager_email)),''),manager_key,actor->>'email',
  CASE WHEN manager_key IS NULL THEN 'unassigned' WHEN nullif(lower(trim(u.manager_email)),'') IS NULL THEN 'assigned' ELSE 'reassigned' END
 FROM public.users u WHERE lower(u.email)=ANY(target_emails) AND u.role='User' AND u.active
  AND nullif(lower(trim(u.manager_email)),'') IS DISTINCT FROM manager_key;
 UPDATE public.users SET manager_email=manager_key
 WHERE lower(email)=ANY(target_emails) AND role='User' AND active
  AND nullif(lower(trim(manager_email)),'') IS DISTINCT FROM manager_key;
 GET DIAGNOSTICS affected=ROW_COUNT;
 INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
 VALUES(CASE WHEN manager_key IS NULL THEN 'users_unassigned_from_manager' ELSE 'users_assigned_to_manager' END,
  actor->>'email','user_allocation',coalesce(manager_key,'unassigned'),affected::text||' active user(s) updated');
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.assign_users_to_manager(text,text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_users_to_manager(text,text[],text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.assert_final_approver_department() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE approver_department uuid; approver_role text;
BEGIN
 IF NEW.final_approval_email IS DISTINCT FROM OLD.final_approval_email AND NEW.final_approval_email IS NOT NULL THEN
  SELECT department_id,role INTO approver_department,approver_role FROM public.users
   WHERE lower(email)=lower(NEW.final_approval_email) AND active;
  IF approver_role IS DISTINCT FROM 'Super Admin' OR approver_department IS DISTINCT FROM NEW.department_id THEN
   RAISE EXCEPTION 'Final approval must be completed by the HOD Super Admin for this claim department';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS claims_assert_final_approver_department ON public.claims;
CREATE TRIGGER claims_assert_final_approver_department BEFORE UPDATE OF final_approval_email ON public.claims
FOR EACH ROW EXECUTE FUNCTION public.assert_final_approver_department();

CREATE OR REPLACE FUNCTION public.assert_admin_verifier_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE verifier_department uuid; verifier_role text;
BEGIN
 IF NEW.admin_email IS DISTINCT FROM OLD.admin_email AND NEW.admin_email IS NOT NULL THEN
  SELECT department_id,role INTO verifier_department,verifier_role FROM public.users
   WHERE lower(email)=lower(NEW.admin_email) AND active;
  IF verifier_role IS NULL OR (verifier_role NOT IN ('Admin','Master Admin') AND NOT (verifier_role='Super Admin' AND verifier_department IS NOT DISTINCT FROM NEW.department_id)) THEN
   RAISE EXCEPTION 'Admin verification must be completed by an Admin or by this department HOD';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS claims_assert_admin_verifier_role ON public.claims;
CREATE TRIGGER claims_assert_admin_verifier_role BEFORE UPDATE OF admin_email ON public.claims
FOR EACH ROW EXECUTE FUNCTION public.assert_admin_verifier_role();

CREATE OR REPLACE FUNCTION public.assert_central_accounts_actions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE action_email text; action_role text;
BEGIN
 IF (NEW.accounts_verified_email IS DISTINCT FROM OLD.accounts_verified_email OR NEW.accounts_verified_date IS DISTINCT FROM OLD.accounts_verified_date OR NEW.accounts_note IS DISTINCT FROM OLD.accounts_note OR (NEW.status='Accounts Verified' AND OLD.status IS DISTINCT FROM NEW.status)) THEN
  action_email:=coalesce(NEW.accounts_verified_email,public.app_current_email());
 ELSIF (NEW.paid_email IS DISTINCT FROM OLD.paid_email OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference OR NEW.payment_note IS DISTINCT FROM OLD.payment_note OR (NEW.status='Paid' AND OLD.status IS DISTINCT FROM NEW.status) OR NEW.paid_date IS DISTINCT FROM OLD.paid_date) THEN
  action_email:=coalesce(NEW.paid_email,public.app_current_email());
 ELSIF (NEW.sap_exported_by IS DISTINCT FROM OLD.sap_exported_by OR NEW.sap_export_batch_id IS DISTINCT FROM OLD.sap_export_batch_id OR NEW.sap_exported_at IS DISTINCT FROM OLD.sap_exported_at OR NEW.sap_exported IS DISTINCT FROM OLD.sap_exported) THEN
  action_email:=coalesce(NEW.sap_exported_by,public.app_current_email());
 ELSE
  RETURN NEW;
 END IF;
 SELECT role INTO action_role FROM public.users WHERE lower(email)=lower(action_email) AND active;
 IF action_role IS DISTINCT FROM 'Accounts' THEN
  RAISE EXCEPTION 'Accounts verification, SAP export, and payment must be handled by the central Accounts role';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS claims_assert_central_accounts_actions ON public.claims;
CREATE TRIGGER claims_assert_central_accounts_actions BEFORE UPDATE OF accounts_verified_email,paid_email,sap_exported_by ON public.claims
FOR EACH ROW EXECUTE FUNCTION public.assert_central_accounts_actions();

DROP POLICY IF EXISTS users_insert ON public.users;
DROP POLICY IF EXISTS users_update ON public.users;
DROP POLICY IF EXISTS users_delete ON public.users;
CREATE POLICY users_insert ON public.users FOR INSERT WITH CHECK (app_current_role() IN ('Admin','Super Admin','Master Admin'));
CREATE POLICY users_update ON public.users FOR UPDATE USING (email=app_current_email() OR app_current_role() IN ('Admin','Super Admin','Master Admin'));
CREATE POLICY users_delete ON public.users FOR DELETE USING (app_current_role() IN ('Super Admin','Master Admin'));

CREATE OR REPLACE FUNCTION public.protect_user_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_setting('siteconnect.auth_write',true)='true' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND app_current_role()='Accounts' AND (to_jsonb(NEW)-ARRAY['sap_gl_code','sap_location_code']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['sap_gl_code','sap_location_code']) THEN RETURN NEW; END IF;
 IF app_current_role() NOT IN ('Admin','Super Admin','Master Admin') OR app_current_role() IS NULL THEN
  IF (to_jsonb(NEW)-ARRAY['profile_picture_url','signature_url']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['profile_picture_url','signature_url']) THEN RAISE EXCEPTION 'Only profile image and signature may be changed directly'; END IF;
 ELSIF app_current_role()<>'Master Admin' THEN
  IF TG_OP='UPDATE' AND OLD.role='Master Admin' THEN RAISE EXCEPTION 'Only a Master Admin can modify Master Admin accounts'; END IF;
  IF NEW.role='Super Admin' AND (TG_OP='INSERT' OR OLD.role IS DISTINCT FROM NEW.role) THEN RAISE EXCEPTION 'Only a Master Admin can assign department HOD Super Admins'; END IF;
  IF NEW.role='Master Admin' AND NOT (
    TG_OP='UPDATE' AND app_current_role()='Super Admin' AND lower(NEW.email)=lower(app_current_email())
    AND NOT EXISTS(SELECT 1 FROM public.users WHERE role='Master Admin' AND active AND lower(email)<>lower(OLD.email))
  ) THEN RAISE EXCEPTION 'A Super Admin may only promote itself to the first Master Admin'; END IF;
 END IF;
 IF app_current_role()<>'Master Admin' AND ((TG_OP='INSERT' AND NEW.department_id IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.department_id IS DISTINCT FROM OLD.department_id)) THEN
  RAISE EXCEPTION 'Only a Master Admin can assign users to departments';
 END IF;
 RETURN NEW;
END $$;

DROP POLICY IF EXISTS claims_read ON public.claims;
DROP POLICY IF EXISTS claims_update ON public.claims;
DROP POLICY IF EXISTS claims_delete ON public.claims;
CREATE POLICY claims_read ON public.claims FOR SELECT USING (
 user_email=app_current_email()
 OR manager_email=app_current_email()
 OR app_current_role() IN ('Admin','Accounts','Master Admin')
 OR (app_current_role()='Super Admin' AND (department_id=app_current_department_id() OR department_id IS NULL))
);
CREATE POLICY claims_update ON public.claims FOR UPDATE
 USING (
  app_current_role() IN ('Admin','Accounts','Master Admin')
  OR (app_current_role()='Super Admin' AND (department_id=app_current_department_id() OR department_id IS NULL))
  OR (app_current_role()='Manager' AND manager_email=app_current_email() AND status IN ('Admin Verified','Pending Manager Approval'))
 )
 WITH CHECK (
  app_current_role() IN ('Admin','Accounts','Master Admin')
  OR (app_current_role()='Super Admin' AND (department_id=app_current_department_id() OR department_id IS NULL))
  OR (app_current_role()='Manager' AND manager_email=app_current_email() AND status IN ('Manager Approved','Rejected'))
 );
CREATE POLICY claims_delete ON public.claims FOR DELETE USING (app_current_role() IN ('Super Admin','Master Admin'));

DROP POLICY IF EXISTS claims_insert ON public.claims;
CREATE POLICY claims_insert ON public.claims FOR INSERT WITH CHECK (
 user_email=app_current_email() AND department_id=app_current_department_id() AND department_id IS NOT NULL
 AND status='Submitted' AND verified_amount IS NULL AND NOT sap_exported AND paid_date IS NULL
);

DROP POLICY IF EXISTS transactions_read ON public.transactions;
CREATE POLICY transactions_read ON public.transactions FOR SELECT USING (
 user_email=app_current_email()
 OR app_current_role() IN ('Admin','Accounts','Master Admin')
 OR EXISTS(SELECT 1 FROM public.users u WHERE u.email=transactions.user_email AND u.manager_email=app_current_email())
 OR (app_current_role()='Super Admin' AND EXISTS(SELECT 1 FROM public.users u WHERE u.email=transactions.user_email AND (u.department_id=app_current_department_id() OR u.department_id IS NULL)))
);
DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions FOR INSERT WITH CHECK (app_current_role() IN ('Admin','Master Admin','Accounts') OR
 (app_current_role()='Manager' AND type='claim_rejected_refund' AND debit=0 AND EXISTS(SELECT 1 FROM claims c WHERE c.claim_id=reference_id AND c.manager_email=app_current_email() AND c.user_email=transactions.user_email AND c.status='Rejected' AND coalesce(c.verified_amount,c.grand_total)=credit)));
DROP POLICY IF EXISTS transactions_update ON public.transactions;
CREATE POLICY transactions_update ON public.transactions FOR UPDATE USING (app_current_role() IN ('Admin','Master Admin','Accounts'));
DROP POLICY IF EXISTS transactions_delete ON public.transactions;
CREATE POLICY transactions_delete ON public.transactions FOR DELETE USING (app_current_role() IN ('Super Admin','Master Admin'));

DROP POLICY IF EXISTS settings_write ON public.company_settings;
CREATE POLICY settings_write ON public.company_settings FOR ALL USING (app_current_role() IN ('Admin','Master Admin')) WITH CHECK (app_current_role() IN ('Admin','Master Admin'));
DROP POLICY IF EXISTS lists_write ON public.app_lists;
CREATE POLICY lists_write ON public.app_lists FOR ALL USING (app_current_role() IN ('Admin','Master Admin')) WITH CHECK (app_current_role() IN ('Admin','Master Admin'));
DROP POLICY IF EXISTS audit_read ON public.audit_logs;
CREATE POLICY audit_read ON public.audit_logs FOR SELECT USING (app_current_role() IN ('Admin','Accounts','Master Admin') OR (app_current_role()='Super Admin' AND EXISTS(SELECT 1 FROM claims c WHERE c.claim_id=target_id AND (c.department_id=app_current_department_id() OR c.department_id IS NULL))) OR performed_by=app_current_email() OR (target_type='claim' AND EXISTS(SELECT 1 FROM claims c WHERE c.claim_id=target_id AND (c.user_email=app_current_email() OR c.manager_email=app_current_email()))));

NOTIFY pgrst,'reload schema';
COMMIT;
