BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE IF NOT EXISTS public.auth_attempts(email text NOT NULL,kind text NOT NULL,attempted_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_attempts FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.app_session(p_token text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('email',u.email,'name',u.name,'role',u.role,'profile_picture_url',u.profile_picture_url,'signature_url',u.signature_url)
 FROM users u JOIN sessions s ON s.user_email=u.email
 WHERE s.token=p_token AND s.expires_at>now() AND u.active LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.app_current_email() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.app_session(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-claims-token')->>'email'
$$;
CREATE OR REPLACE FUNCTION public.app_current_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.app_session(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-claims-token')->>'role'
$$;
CREATE OR REPLACE FUNCTION public.app_login(p_email text,p_password text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u users%ROWTYPE; session_token text; email_key text:=lower(trim(p_email)); valid boolean;
BEGIN
 IF email_key IS NULL OR p_password IS NULL OR length(email_key)>320 OR length(p_password)>1024 THEN RETURN jsonb_build_object('ok',false,'message','Invalid email or password.'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('login:'||email_key,0));
 IF (SELECT count(*) FROM auth_attempts WHERE email=email_key AND kind='login' AND attempted_at>now()-interval '15 minutes')>=10 THEN RETURN jsonb_build_object('ok',false,'message','Too many attempts. Try again in 15 minutes.'); END IF;
 INSERT INTO auth_attempts(email,kind) VALUES(email_key,'login');
 SELECT * INTO u FROM users WHERE lower(email)=email_key AND active FOR UPDATE;
 IF FOUND THEN
  valid:=CASE WHEN u.password_hash LIKE '$2%' THEN crypt(p_password,u.password_hash)=u.password_hash ELSE encode(digest(p_password,'sha256'),'hex')=u.password_hash END;
 END IF;
 IF NOT coalesce(valid,false) THEN RETURN jsonb_build_object('ok',false,'message','Invalid email or password.'); END IF;
 PERFORM set_config('siteconnect.auth_write','true',true);
 IF u.password_hash NOT LIKE '$2%' AND octet_length(p_password)<=72 THEN UPDATE users SET password_hash=crypt(p_password,gen_salt('bf',12)) WHERE id=u.id; END IF;
 DELETE FROM auth_attempts WHERE email=email_key AND kind='login';
 session_token:=encode(gen_random_bytes(32),'hex');
 INSERT INTO sessions(token,user_email,role,expires_at) VALUES(session_token,u.email,u.role,now()+interval '24 hours');
 RETURN jsonb_build_object('ok',true,'message','Signed in','session',jsonb_build_object('token',session_token,'user',public.app_session(session_token)));
END $$;
CREATE OR REPLACE FUNCTION public.app_logout(p_token text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ DELETE FROM sessions WHERE token=p_token $$;
CREATE OR REPLACE FUNCTION public.app_change_password(p_token text,p_current_password text,p_new_password text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u users%ROWTYPE; actor text:=public.app_session(p_token)->>'email'; valid boolean;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in again'; END IF;
 IF p_new_password IS NULL OR length(p_new_password)<8 OR octet_length(p_new_password)>72 OR p_new_password !~ '[a-z]' OR p_new_password !~ '[A-Z]' OR p_new_password !~ '[0-9]' THEN RAISE EXCEPTION 'Use 8–72 characters with uppercase, lowercase and a number'; END IF;
 SELECT * INTO u FROM users WHERE email=actor FOR UPDATE;
 valid:=CASE WHEN u.password_hash LIKE '$2%' THEN crypt(p_current_password,u.password_hash)=u.password_hash ELSE encode(digest(p_current_password,'sha256'),'hex')=u.password_hash END;
 IF NOT coalesce(valid,false) THEN RAISE EXCEPTION 'Current password is incorrect'; END IF;
 PERFORM set_config('siteconnect.auth_write','true',true);
 UPDATE users SET password_hash=crypt(p_new_password,gen_salt('bf',12)) WHERE id=u.id;
 DELETE FROM sessions WHERE user_email=actor AND token<>p_token;
END $$;
CREATE OR REPLACE FUNCTION public.app_issue_password_reset(p_email text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE reset_token text; email_key text:=lower(trim(p_email));
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('reset:'||email_key,0));
 IF NOT EXISTS(SELECT 1 FROM users WHERE email=email_key AND active) THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM auth_attempts WHERE email=email_key AND kind='reset' AND attempted_at>now()-interval '1 hour')>=3 THEN RETURN NULL; END IF;
 INSERT INTO auth_attempts(email,kind) VALUES(email_key,'reset');
 reset_token:=encode(gen_random_bytes(32),'hex');
 DELETE FROM password_resets WHERE email=email_key;
 INSERT INTO password_resets(email,token,expires_at) VALUES(email_key,encode(digest(reset_token,'sha256'),'hex'),now()+interval '1 hour');
 RETURN reset_token;
END $$;
CREATE OR REPLACE FUNCTION public.app_reset_password(p_email text,p_token text,p_password text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE reset_id uuid; email_key text:=lower(trim(p_email));
BEGIN
 IF p_password IS NULL OR length(p_password)<8 OR octet_length(p_password)>72 OR p_password !~ '[a-z]' OR p_password !~ '[A-Z]' OR p_password !~ '[0-9]' THEN RAISE EXCEPTION 'Use 8–72 characters with uppercase, lowercase and a number'; END IF;
 SELECT id INTO reset_id FROM password_resets WHERE email=email_key AND token=encode(digest(p_token,'sha256'),'hex') AND expires_at>now() FOR UPDATE;
 IF reset_id IS NULL THEN RAISE EXCEPTION 'Invalid or expired reset link'; END IF;
 PERFORM set_config('siteconnect.auth_write','true',true);
 UPDATE users SET password_hash=crypt(p_password,gen_salt('bf',12)) WHERE email=email_key AND active;
 DELETE FROM password_resets WHERE id=reset_id;
 DELETE FROM sessions WHERE user_email=email_key;
END $$;

-- Remove unrestricted legacy policies. The browser must send a valid custom session.
DO $$ DECLARE p record; t text;
BEGIN
 FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='public' LOOP
  EXECUTE format('DROP POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename);
 END LOOP;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); END LOOP;
END $$;
REVOKE ALL ON public.sessions,public.password_resets FROM anon,authenticated;
REVOKE SELECT ON public.users FROM anon,authenticated;
DO $$ DECLARE cols text;
BEGIN
 SELECT string_agg(quote_ident(column_name),',') INTO cols FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name<>'password_hash';
 EXECUTE 'GRANT SELECT ('||cols||') ON public.users TO anon,authenticated';
END $$;
CREATE POLICY users_read ON public.users FOR SELECT USING (app_current_email() IS NOT NULL);
CREATE POLICY users_insert ON public.users FOR INSERT WITH CHECK (app_current_role() IN ('Admin','Super Admin'));
CREATE POLICY users_update ON public.users FOR UPDATE USING (email=app_current_email() OR app_current_role() IN ('Admin','Super Admin'));
CREATE POLICY users_delete ON public.users FOR DELETE USING (app_current_role()='Super Admin');
CREATE FUNCTION public.protect_user_fields() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_setting('siteconnect.auth_write',true)='true' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND app_current_role()='Accounts' AND (to_jsonb(NEW)-ARRAY['sap_gl_code','sap_location_code']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['sap_gl_code','sap_location_code']) THEN RETURN NEW; END IF;
 IF app_current_role() NOT IN ('Admin','Super Admin') OR app_current_role() IS NULL THEN
  IF (to_jsonb(NEW)-ARRAY['profile_picture_url','signature_url']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['profile_picture_url','signature_url']) THEN RAISE EXCEPTION 'Only profile image and signature may be changed directly'; END IF;
 ELSIF app_current_role()<>'Super Admin' AND ((TG_OP='INSERT' AND NEW.role='Super Admin') OR (TG_OP='UPDATE' AND (OLD.role='Super Admin' OR NEW.role='Super Admin'))) THEN RAISE EXCEPTION 'Only a Super Admin can modify Super Admin accounts';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_user_fields BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.protect_user_fields();
CREATE POLICY claims_read ON public.claims FOR SELECT USING (user_email=app_current_email() OR manager_email=app_current_email() OR app_current_role() IN ('Admin','Super Admin','Accounts'));
CREATE POLICY claims_insert ON public.claims FOR INSERT WITH CHECK (user_email=app_current_email() AND status='Submitted' AND verified_amount IS NULL AND NOT sap_exported AND paid_date IS NULL);
CREATE POLICY claims_update ON public.claims FOR UPDATE USING (app_current_role() IN ('Admin','Super Admin','Accounts') OR (app_current_role()='Manager' AND manager_email=app_current_email() AND status IN ('Admin Verified','Pending Manager Approval'))) WITH CHECK (app_current_role() IN ('Admin','Super Admin','Accounts') OR (manager_email=app_current_email() AND status IN ('Manager Approved','Rejected')));
CREATE POLICY claims_delete ON public.claims FOR DELETE USING (app_current_role()='Super Admin');
CREATE POLICY expenses_read ON public.expense_items FOR SELECT USING (EXISTS(SELECT 1 FROM claims c WHERE c.claim_id=expense_items.claim_id));
CREATE POLICY expenses_insert ON public.expense_items FOR INSERT WITH CHECK (approved_amount IS NULL AND EXISTS(SELECT 1 FROM claims c WHERE c.claim_id=expense_items.claim_id AND c.user_email=app_current_email() AND c.status='Submitted'));
CREATE POLICY expenses_update ON public.expense_items FOR UPDATE USING (app_current_role() IN ('Admin','Super Admin'));
CREATE POLICY expenses_delete ON public.expense_items FOR DELETE USING (app_current_role()='Super Admin');
CREATE POLICY transactions_read ON public.transactions FOR SELECT USING (user_email=app_current_email() OR app_current_role() IN ('Admin','Super Admin','Accounts') OR EXISTS(SELECT 1 FROM users u WHERE u.email=transactions.user_email AND u.manager_email=app_current_email()));
CREATE POLICY transactions_insert ON public.transactions FOR INSERT WITH CHECK (app_current_role() IN ('Admin','Super Admin','Accounts') OR (user_email=app_current_email() AND type='claim_submitted' AND credit=0 AND EXISTS(SELECT 1 FROM claims c WHERE c.claim_id=reference_id AND c.user_email=app_current_email() AND c.status='Submitted' AND c.grand_total=debit)));
CREATE POLICY transactions_update ON public.transactions FOR UPDATE USING (app_current_role() IN ('Admin','Super Admin','Accounts'));
CREATE POLICY transactions_delete ON public.transactions FOR DELETE USING (app_current_role()='Super Admin');
CREATE POLICY settings_read ON public.company_settings FOR SELECT USING (true);
CREATE POLICY settings_write ON public.company_settings FOR ALL USING (app_current_role() IN ('Admin','Super Admin')) WITH CHECK (app_current_role() IN ('Admin','Super Admin'));
CREATE POLICY lists_read ON public.app_lists FOR SELECT USING (app_current_email() IS NOT NULL);
CREATE POLICY lists_write ON public.app_lists FOR ALL USING (app_current_role() IN ('Admin','Super Admin')) WITH CHECK (app_current_role() IN ('Admin','Super Admin'));
CREATE POLICY notifications_read ON public.notifications FOR SELECT USING (user_email=app_current_email());
CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING (user_email=app_current_email());
CREATE POLICY notifications_insert ON public.notifications FOR INSERT WITH CHECK (app_current_email() IS NOT NULL);
CREATE POLICY audit_read ON public.audit_logs FOR SELECT USING (app_current_role() IN ('Admin','Super Admin','Accounts') OR performed_by=app_current_email() OR (target_type='claim' AND EXISTS(SELECT 1 FROM claims c WHERE c.claim_id=target_id)));
CREATE POLICY audit_insert ON public.audit_logs FOR INSERT WITH CHECK (app_current_email() IS NOT NULL);
CREATE FUNCTION public.stamp_audit_actor() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF app_current_email() IS NOT NULL THEN NEW.performed_by:=app_current_email(); END IF; RETURN NEW; END $$;
CREATE TRIGGER stamp_audit_actor BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_actor();
CREATE POLICY work_read ON public.project_works FOR SELECT USING (app_current_email() IS NOT NULL);
CREATE POLICY sap_locations_read ON public.sap_locations FOR SELECT USING (app_current_email() IS NOT NULL);
CREATE POLICY sap_groups_read ON public.sap_expense_groups FOR SELECT USING (app_current_email() IS NOT NULL);
CREATE POLICY batches_read ON public.sap_export_batches FOR SELECT USING (app_current_role() IN ('Admin','Super Admin','Accounts'));
CREATE POLICY batch_items_read ON public.sap_export_batch_items FOR SELECT USING (app_current_role() IN ('Admin','Super Admin','Accounts'));

-- Functions that reserve vouchers are internal to authorized database operations.
REVOKE EXECUTE ON FUNCTION public.next_payment_voucher_code() FROM PUBLIC,anon,authenticated;
-- The existing UI calls this helper; validate caller's finance role before assignment.
ALTER FUNCTION public.assign_payment_voucher_code(text) RENAME TO assign_payment_voucher_code_internal;
REVOKE EXECUTE ON FUNCTION public.assign_payment_voucher_code_internal(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.assign_payment_voucher_code(target_claim_id text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF app_current_role() NOT IN ('Admin','Super Admin','Accounts') OR app_current_role() IS NULL THEN RAISE EXCEPTION 'Finance sign-in required'; END IF;
 RETURN public.assign_payment_voucher_code_internal(target_claim_id);
END $$;
DO $$ DECLARE fn record;
BEGIN
 FOR fn IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('app_login','app_session','app_logout','app_change_password','app_reset_password','app_current_email','app_current_role','assign_payment_voucher_code') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon,authenticated,service_role',fn.signature);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.app_issue_password_reset(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.app_issue_password_reset(text) TO service_role;
-- Previously public tokens must no longer grant access after this release.
DELETE FROM public.sessions;
DELETE FROM public.password_resets;
NOTIFY pgrst,'reload schema';
COMMIT;
