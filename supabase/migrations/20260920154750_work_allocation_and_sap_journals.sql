-- Additive migration: historical claims and exports remain unchanged.
CREATE TABLE public.sap_locations (
  code TEXT PRIMARY KEY CHECK (length(trim(code)) > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  costing_code TEXT NOT NULL CHECK (length(trim(costing_code)) > 0)
);
INSERT INTO public.sap_locations VALUES
 ('2','Bangalore','Bangalor'), ('3','Chennai','Chennai'),
 ('4','Coimbatore','Coimbato'), ('5','Noida','Noida'),
 ('6','Pune','Pune'), ('7','Surat','Surat'), ('8','Goa','Goa');

CREATE TABLE public.sap_expense_groups (
 code TEXT PRIMARY KEY CHECK (code IN ('travel','da','other','boarding')),
 name TEXT NOT NULL,
 gl_code TEXT NOT NULL CHECK (length(trim(gl_code)) > 0),
 line_number INTEGER NOT NULL UNIQUE CHECK (line_number BETWEEN 1 AND 4)
);
INSERT INTO public.sap_expense_groups VALUES
 ('travel','Travel expenses','4330900007',1),
 ('da','Per diem (DA)','4310000007',2),
 ('other','Other expenses','4332000016',3),
 ('boarding','Boarding / room rent','4330900001',4);

ALTER TABLE public.users
 ADD COLUMN sap_gl_code TEXT,
 ADD COLUMN sap_location_code TEXT REFERENCES public.sap_locations(code);
ALTER TABLE public.app_lists
 ADD COLUMN sap_location_code TEXT REFERENCES public.sap_locations(code),
 ADD COLUMN sap_project_code TEXT,
 ADD COLUMN sap_expense_group TEXT REFERENCES public.sap_expense_groups(code),
 ADD COLUMN default_manager_email TEXT;

CREATE TABLE public.project_works (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id UUID NOT NULL REFERENCES public.app_lists(id),
 name TEXT NOT NULL CHECK (length(trim(name)) > 0),
 manager_email TEXT,
 active BOOLEAN NOT NULL DEFAULT true,
 UNIQUE(project_id, name)
);
ALTER TABLE public.claims
 ADD COLUMN work_id UUID REFERENCES public.project_works(id),
 ADD COLUMN work_name TEXT;
ALTER TABLE public.sap_export_batches ADD COLUMN export_payload JSONB;
-- Localhost and the older deployed frontend share this database. Enable this
-- switch only after all clients support work selection; the new UI always requires it.
ALTER TABLE public.company_settings ADD COLUMN require_work_allocation BOOLEAN NOT NULL DEFAULT false;
CREATE SEQUENCE public.sap_journal_id_seq;

ALTER TABLE public.sap_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sap_expense_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_works ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read SAP locations" ON public.sap_locations FOR SELECT USING (true);
CREATE POLICY "Read SAP expense groups" ON public.sap_expense_groups FOR SELECT USING (true);
CREATE POLICY "Read project work" ON public.project_works FOR SELECT USING (true);
GRANT SELECT ON public.sap_locations,public.sap_expense_groups,public.project_works TO anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.sap_locations,public.sap_expense_groups,public.project_works FROM anon,authenticated;

-- Integrates with the application's existing custom session tokens.
CREATE FUNCTION public.require_finance_session(p_token TEXT, p_admin_only BOOLEAN DEFAULT false)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor TEXT;
BEGIN
 SELECT u.email INTO actor FROM public.sessions s JOIN public.users u ON u.email = s.user_email
 WHERE s.token = p_token AND s.expires_at > now() AND u.active
 AND (u.role IN ('Admin','Super Admin') OR (NOT p_admin_only AND u.role = 'Accounts'));
 IF actor IS NULL THEN RAISE EXCEPTION 'A valid authorized session is required'; END IF;
 RETURN actor;
END $$;
REVOKE ALL ON FUNCTION public.require_finance_session(TEXT,BOOLEAN) FROM PUBLIC;

CREATE FUNCTION public.save_accounting_master(p_token TEXT, p_kind TEXT, p_id TEXT, p_values JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor TEXT; manager TEXT; project_uuid UUID;
BEGIN
 actor := public.require_finance_session(p_token, p_kind IN ('work','project_manager'));
 IF p_kind = 'user' THEN
   UPDATE public.users SET sap_gl_code = nullif(trim(p_values->>'sap_gl_code'),''),
    sap_location_code = nullif(p_values->>'sap_location_code','') WHERE email = p_id;
 ELSIF p_kind = 'project' THEN
   UPDATE public.app_lists SET sap_project_code = nullif(trim(p_values->>'sap_project_code'),''),
    sap_location_code = nullif(p_values->>'sap_location_code','') WHERE id = p_id::uuid AND type = 'project';
 ELSIF p_kind = 'projectcode' THEN
   UPDATE public.app_lists SET sap_project_code = nullif(trim(p_values->>'sap_project_code'),'')
   WHERE id = p_id::uuid AND type = 'projectcode';
 ELSIF p_kind = 'category' THEN
   UPDATE public.app_lists SET sap_expense_group = nullif(p_values->>'sap_expense_group','') WHERE id = p_id::uuid AND type = 'category';
 ELSIF p_kind = 'group' THEN
   UPDATE public.sap_expense_groups SET gl_code = trim(p_values->>'gl_code') WHERE code = p_id;
 ELSIF p_kind = 'location' THEN
   INSERT INTO public.sap_locations(code,name,costing_code) VALUES(trim(p_id),trim(p_values->>'name'),trim(p_values->>'costing_code'))
   ON CONFLICT (code) DO UPDATE SET name = excluded.name, costing_code = excluded.costing_code;
 ELSIF p_kind IN ('work','project_manager') THEN
   manager := nullif(lower(trim(p_values->>'manager_email')),'');
   IF manager IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE email = manager AND active AND role IN ('Manager','Super Admin')) THEN
     RAISE EXCEPTION 'Choose an active manager';
   END IF;
   IF p_kind = 'project_manager' THEN
     UPDATE public.app_lists SET default_manager_email = manager WHERE id = p_id::uuid AND type = 'project';
     IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
     -- Give a newly configured project its initial work allocation, inheriting its manager.
     IF manager IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_works WHERE project_id = p_id::uuid) THEN
       INSERT INTO public.project_works(project_id,name) VALUES(p_id::uuid,'General work');
     END IF;
   ELSE
     project_uuid := (p_values->>'project_id')::uuid;
     IF NOT EXISTS(SELECT 1 FROM public.app_lists WHERE id = project_uuid AND type = 'project' AND active) THEN RAISE EXCEPTION 'Project not found'; END IF;
     INSERT INTO public.project_works(id,project_id,name,manager_email,active)
     VALUES(coalesce(nullif(p_id,'')::uuid,gen_random_uuid()),project_uuid,trim(p_values->>'name'),manager,coalesce((p_values->>'active')::boolean,true))
     ON CONFLICT(id) DO UPDATE SET name=excluded.name,manager_email=excluded.manager_email,active=excluded.active
     WHERE project_works.project_id=excluded.project_id;
   END IF;
 ELSE RAISE EXCEPTION 'Unknown master type';
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Master record not found'; END IF;
 INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
 VALUES('accounting_master_updated',actor,p_kind,p_id,p_values::text);
END $$;
REVOKE ALL ON FUNCTION public.save_accounting_master(TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_accounting_master(TEXT,TEXT,TEXT,JSONB) TO anon, authenticated;

-- Always snapshot the manager at submission; later allocation edits do not reroute a claim.
CREATE FUNCTION public.enforce_claim_work() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE work_record RECORD;
BEGIN
 IF TG_OP = 'INSERT' THEN
   IF NEW.work_id IS NULL THEN
     IF EXISTS(SELECT 1 FROM public.company_settings WHERE require_work_allocation) THEN
       RAISE EXCEPTION 'Select the project work before submitting';
     END IF;
     RETURN NEW;
   END IF;
   SELECT w.name, p.value project_name, coalesce(w.manager_email,p.default_manager_email) manager
   INTO work_record FROM public.project_works w JOIN public.app_lists p ON p.id=w.project_id
   WHERE w.id=NEW.work_id AND w.active AND p.active AND p.type='project';
   IF NOT FOUND OR work_record.project_name <> NEW.site_name THEN RAISE EXCEPTION 'Choose an active work for this project'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.users WHERE email=work_record.manager AND active AND role IN ('Manager','Super Admin')) THEN RAISE EXCEPTION 'The work requires an active assigned manager'; END IF;
   NEW.work_name := work_record.name;
   NEW.manager_email := work_record.manager;
   NEW.status := 'Submitted'; NEW.manager_approval_status := 'Not Started';
 ELSIF OLD.work_id IS NOT NULL THEN
   IF NEW.work_id IS DISTINCT FROM OLD.work_id OR NEW.manager_email IS DISTINCT FROM OLD.manager_email OR NEW.site_name IS DISTINCT FROM OLD.site_name OR NEW.work_name IS DISTINCT FROM OLD.work_name THEN
     RAISE EXCEPTION 'Submitted work and manager cannot be changed';
   END IF;
   IF OLD.status IN ('Submitted','Pending Admin Verification') AND NEW.status NOT IN (OLD.status,'Admin Verified','Rejected') THEN
     RAISE EXCEPTION 'Work claims require admin verification followed by manager approval';
   END IF;
   IF OLD.status IN ('Admin Verified','Pending Manager Approval') AND NEW.status NOT IN (OLD.status,'Manager Approved','Rejected') THEN
     RAISE EXCEPTION 'Work claims require manager approval';
   END IF;
   IF OLD.status IN ('Admin Verified','Pending Manager Approval') AND NEW.status IN ('Manager Approved','Rejected')
      AND current_setting('siteconnect.work_manager',true) IS DISTINCT FROM OLD.manager_email THEN
     RAISE EXCEPTION 'Sign in as the assigned work manager to perform this action';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enforce_claim_work BEFORE INSERT OR UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.enforce_claim_work();

CREATE FUNCTION public.act_on_work_claim(p_token TEXT,p_claim_id TEXT,p_approve BOOLEAN,p_amount NUMERIC DEFAULT NULL,p_note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor TEXT; c RECORD;
BEGIN
 SELECT u.email INTO actor FROM sessions s JOIN users u ON u.email=s.user_email
 WHERE s.token=p_token AND s.expires_at>now() AND u.active AND u.role IN ('Manager','Super Admin');
 SELECT * INTO c FROM claims WHERE claim_id=p_claim_id FOR UPDATE;
 IF NOT FOUND OR c.work_id IS NULL OR actor IS NULL OR actor IS DISTINCT FROM c.manager_email THEN RAISE EXCEPTION 'Sign in as the manager assigned to this work'; END IF;
 IF c.status NOT IN ('Admin Verified','Pending Manager Approval') THEN RAISE EXCEPTION 'This claim is no longer awaiting manager approval'; END IF;
 IF p_approve AND (p_amount IS NULL OR p_amount<0 OR round(p_amount,2)<>p_amount) THEN RAISE EXCEPTION 'Enter a valid approved amount'; END IF;
 PERFORM set_config('siteconnect.work_manager',actor,true);
 UPDATE claims SET status=CASE WHEN p_approve THEN 'Manager Approved' ELSE 'Rejected' END,
 manager_approval_status=CASE WHEN p_approve THEN 'Approved' ELSE 'Rejected' END,
 manager_approval_date=now(),
 rejection_reason=CASE WHEN p_approve THEN rejection_reason ELSE p_note END,
 verified_amount=CASE WHEN p_approve THEN p_amount ELSE verified_amount END WHERE claim_id=p_claim_id;
END $$;
REVOKE ALL ON FUNCTION public.act_on_work_claim(TEXT,TEXT,BOOLEAN,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.act_on_work_claim(TEXT,TEXT,BOOLEAN,NUMERIC,TEXT) TO anon,authenticated;

CREATE FUNCTION public.reserve_sap_journal_ids(p_token TEXT, p_count INTEGER) RETURNS SETOF BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 PERFORM public.require_finance_session(p_token);
 IF p_count < 1 OR p_count > 10000 THEN RAISE EXCEPTION 'Invalid journal count'; END IF;
 RETURN QUERY SELECT nextval('public.sap_journal_id_seq') FROM generate_series(1,p_count);
END $$;
REVOKE ALL ON FUNCTION public.reserve_sap_journal_ids(TEXT,INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_sap_journal_ids(TEXT,INTEGER) TO anon, authenticated;

-- Commit all batch metadata and claim status changes together. Claims are locked in
-- a consistent order; competing exports cannot include the same claim twice.
CREATE FUNCTION public.commit_sap_journal_export(p_token TEXT, p_batch_id TEXT, p_payload JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor TEXT; entry JSONB; c RECORD; total NUMERIC := 0; journal JSONB;
 debit NUMERIC; credit NUMERIC; id TEXT; i INTEGER; claim_total NUMERIC;
BEGIN
 actor := public.require_finance_session(p_token);
 IF p_payload->>'version' <> '1' OR jsonb_array_length(p_payload->'claims') < 1 THEN RAISE EXCEPTION 'Invalid export'; END IF;
 IF jsonb_array_length(p_payload->'headers') - 2 <> jsonb_array_length(p_payload->'journalClaims') THEN RAISE EXCEPTION 'Invalid journal links'; END IF;
 IF (SELECT count(DISTINCT x->>'claimId') FROM jsonb_array_elements(p_payload->'claims') x) <> jsonb_array_length(p_payload->'claims') THEN RAISE EXCEPTION 'Duplicate claims'; END IF;
 IF (SELECT count(DISTINCT x->>0) FROM jsonb_array_elements(p_payload->'headers') WITH ORDINALITY t(x,n) WHERE n>2) <> jsonb_array_length(p_payload->'journalClaims') THEN RAISE EXCEPTION 'Duplicate journal IDs'; END IF;
 FOR journal IN SELECT x FROM jsonb_array_elements(p_payload->'headers') WITH ORDINALITY t(x,n) WHERE n>2 LOOP
   IF jsonb_array_length(journal) <> 14 THEN RAISE EXCEPTION 'Invalid header width'; END IF;
   id := journal->>0;
   SELECT coalesce(sum(nullif(x->>4,'')::numeric),0), coalesce(sum(nullif(x->>5,'')::numeric),0)
   INTO debit,credit FROM jsonb_array_elements(p_payload->'details') WITH ORDINALITY t(x,n) WHERE n>2 AND x->>0=id;
   IF debit <= 0 OR debit <> credit THEN RAISE EXCEPTION 'Journal % does not balance',id; END IF;
 END LOOP;
 FOR journal IN SELECT x FROM jsonb_array_elements(p_payload->'details') WITH ORDINALITY t(x,n) WHERE n>2 LOOP
   IF jsonb_array_length(journal)<>7 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'headers') WITH ORDINALITY t(x,n) WHERE n>2 AND x->>0=journal->>0)
   OR coalesce(nullif(journal->>4,'')::numeric,0)<0 OR coalesce(nullif(journal->>5,'')::numeric,0)<0 THEN RAISE EXCEPTION 'Invalid journal detail'; END IF;
 END LOOP;
 FOR entry IN SELECT x FROM jsonb_array_elements(p_payload->'claims') x ORDER BY x->>'claimId' LOOP
   SELECT * INTO c FROM public.claims WHERE claim_id=entry->>'claimId' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found'; END IF;
   IF c.status <> 'Accounts Verified' OR coalesce(c.sap_exported,false) THEN RAISE EXCEPTION 'Claim % is no longer eligible for export',c.claim_id; END IF;
   IF coalesce(c.verified_amount,c.grand_total) <> (entry->>'amount')::numeric THEN RAISE EXCEPTION 'Approved amount changed. Refresh the preview'; END IF;
   claim_total := 0;
   FOR i IN 0..jsonb_array_length(p_payload->'journalClaims')-1 LOOP
     IF p_payload->'journalClaims'->>i = c.claim_id THEN
       id := p_payload->'headers'->(i+2)->>0;
       SELECT coalesce(sum(nullif(x->>5,'')::numeric),0) INTO credit FROM jsonb_array_elements(p_payload->'details') WITH ORDINALITY t(x,n) WHERE n>2 AND x->>0=id;
       claim_total := claim_total + credit;
     END IF;
   END LOOP;
   IF claim_total <> (entry->>'amount')::numeric THEN RAISE EXCEPTION 'Claim journal total mismatch'; END IF;
   total := total + claim_total;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'journalClaims') j WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'claims') linked_claim WHERE linked_claim->>'claimId'=j)) THEN RAISE EXCEPTION 'Unknown journal claim'; END IF;
 PERFORM set_config('siteconnect.sap_export_batch',p_batch_id,true);
 INSERT INTO public.sap_export_batches(batch_id,generated_by,total_claims,total_amount,export_payload)
 VALUES(p_batch_id,actor,jsonb_array_length(p_payload->'claims'),total,p_payload);
 FOR entry IN SELECT x FROM jsonb_array_elements(p_payload->'claims') x LOOP
   INSERT INTO public.sap_export_batch_items(batch_id,claim_id) VALUES(p_batch_id,entry->>'claimId');
   UPDATE public.claims SET sap_exported=true,sap_exported_at=now(),sap_exported_by=actor,sap_export_batch_id=p_batch_id,status='Payment Processing' WHERE claim_id=entry->>'claimId';
   PERFORM public.assign_payment_voucher_code(entry->>'claimId');
   INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
   VALUES('sap_report_claim_included',actor,'claim',entry->>'claimId',p_batch_id);
 END LOOP;
 INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
 VALUES('sap_report_generated',actor,'sap_export_batch',p_batch_id,'Excel and two TXT files; total: ' || total);
END $$;
REVOKE ALL ON FUNCTION public.commit_sap_journal_export(TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_sap_journal_export(TEXT,TEXT,JSONB) TO anon, authenticated;
-- Preserve the older frontend's Excel-only exports during rollout. New journal
-- snapshots and their membership can only be written by the atomic export function.
CREATE FUNCTION public.protect_sap_journal_batch() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE protected_id TEXT;
BEGIN
 IF TG_OP <> 'INSERT' AND OLD.export_payload IS NOT NULL THEN protected_id := OLD.batch_id; END IF;
 IF TG_OP <> 'DELETE' AND NEW.export_payload IS NOT NULL THEN protected_id := NEW.batch_id; END IF;
 IF protected_id IS NOT NULL AND current_setting('siteconnect.sap_export_batch',true) IS DISTINCT FROM protected_id THEN
   RAISE EXCEPTION 'Journal export snapshots can only be written through the export function';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_sap_journal_batch BEFORE INSERT OR UPDATE OR DELETE ON public.sap_export_batches
FOR EACH ROW EXECUTE FUNCTION public.protect_sap_journal_batch();
CREATE FUNCTION public.protect_sap_journal_membership() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE protected_id TEXT;
BEGIN
 IF TG_OP <> 'INSERT' THEN
   SELECT batch_id INTO protected_id FROM public.sap_export_batches WHERE batch_id=OLD.batch_id AND export_payload IS NOT NULL;
   IF protected_id IS NOT NULL AND current_setting('siteconnect.sap_export_batch',true) IS DISTINCT FROM protected_id THEN RAISE EXCEPTION 'Journal export membership is immutable'; END IF;
 END IF;
 IF TG_OP <> 'DELETE' THEN
   SELECT batch_id INTO protected_id FROM public.sap_export_batches WHERE batch_id=NEW.batch_id AND export_payload IS NOT NULL;
   IF protected_id IS NOT NULL AND current_setting('siteconnect.sap_export_batch',true) IS DISTINCT FROM protected_id THEN RAISE EXCEPTION 'Journal export membership is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_sap_journal_membership BEFORE INSERT OR UPDATE OR DELETE ON public.sap_export_batch_items
FOR EACH ROW EXECUTE FUNCTION public.protect_sap_journal_membership();
NOTIFY pgrst, 'reload schema';
