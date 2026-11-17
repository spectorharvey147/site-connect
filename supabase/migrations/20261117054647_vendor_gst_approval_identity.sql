BEGIN;

CREATE TABLE public.sap_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name text NOT NULL CHECK (length(trim(vendor_name)) > 0),
  short_form text NOT NULL CHECK (length(trim(short_form)) > 0),
  vendor_account_code text NOT NULL UNIQUE CHECK (length(trim(vendor_account_code)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
CREATE UNIQUE INDEX sap_vendors_active_name_unique ON public.sap_vendors(lower(trim(vendor_name))) WHERE active;
CREATE INDEX sap_vendors_short_form_search ON public.sap_vendors USING gin (to_tsvector('simple', short_form || ' ' || vendor_name));
ALTER TABLE public.sap_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY sap_vendors_read ON public.sap_vendors FOR SELECT USING (app_current_email() IS NOT NULL AND (active OR app_current_role() IN ('Accounts','Admin','Super Admin')));
GRANT SELECT ON public.sap_vendors TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sap_vendors FROM anon, authenticated;

CREATE TABLE public.sap_gst_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gst_type text NOT NULL CHECK (gst_type IN ('CGST','SGST','IGST')),
  gl_code text NOT NULL CHECK (length(trim(gl_code)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sap_gst_one_active_type ON public.sap_gst_accounts(gst_type) WHERE active;
ALTER TABLE public.sap_gst_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY sap_gst_read ON public.sap_gst_accounts FOR SELECT USING (app_current_email() IS NOT NULL);
GRANT SELECT ON public.sap_gst_accounts TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sap_gst_accounts FROM anon, authenticated;

ALTER TABLE public.expense_items
  ADD COLUMN has_tax_invoice boolean,
  ADD COLUMN vendor_available boolean,
  ADD COLUMN vendor_id uuid REFERENCES public.sap_vendors(id) ON DELETE RESTRICT,
  ADD COLUMN vendor_account_code_snapshot text,
  ADD COLUMN vendor_short_form_snapshot text,
  ADD COLUMN taxable_amount numeric(14,2),
  ADD COLUMN cgst_amount numeric(14,2),
  ADD COLUMN sgst_amount numeric(14,2),
  ADD COLUMN igst_amount numeric(14,2),
  ADD COLUMN tax_amount numeric(14,2),
  ADD COLUMN accounting_verified_by text,
  ADD COLUMN accounting_verified_at timestamptz;
ALTER TABLE public.expense_items ADD CONSTRAINT expense_accounting_amounts_nonnegative CHECK (
  (taxable_amount IS NULL OR taxable_amount >= 0) AND (cgst_amount IS NULL OR cgst_amount >= 0) AND
  (sgst_amount IS NULL OR sgst_amount >= 0) AND (igst_amount IS NULL OR igst_amount >= 0) AND
  (tax_amount IS NULL OR tax_amount >= 0)
);
CREATE INDEX expense_items_vendor_id_idx ON public.expense_items(vendor_id) WHERE vendor_id IS NOT NULL;

CREATE FUNCTION public.protect_exported_expense_accounting() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.claims WHERE claim_id=OLD.claim_id AND sap_exported)
    AND ROW(NEW.has_tax_invoice,NEW.vendor_available,NEW.vendor_id,NEW.vendor_account_code_snapshot,NEW.vendor_short_form_snapshot,
      NEW.taxable_amount,NEW.cgst_amount,NEW.sgst_amount,NEW.igst_amount,NEW.tax_amount,NEW.accounting_verified_by,NEW.accounting_verified_at)
      IS DISTINCT FROM ROW(OLD.has_tax_invoice,OLD.vendor_available,OLD.vendor_id,OLD.vendor_account_code_snapshot,OLD.vendor_short_form_snapshot,
      OLD.taxable_amount,OLD.cgst_amount,OLD.sgst_amount,OLD.igst_amount,OLD.tax_amount,OLD.accounting_verified_by,OLD.accounting_verified_at) THEN
   RAISE EXCEPTION 'Exported expense accounting classification is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_exported_expense_accounting BEFORE UPDATE ON public.expense_items
FOR EACH ROW EXECUTE FUNCTION public.protect_exported_expense_accounting();

CREATE TABLE public.claim_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id text NOT NULL REFERENCES public.claims(claim_id) ON DELETE RESTRICT,
  approval_stage text NOT NULL,
  action text NOT NULL,
  actor_email text,
  actor_name text,
  approved_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  browser_name text,
  operating_system text,
  device_type text,
  signature_snapshot_url text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, approval_stage, action)
);
CREATE INDEX claim_approval_events_claim_time_idx ON public.claim_approval_events(claim_id, approved_at);
ALTER TABLE public.claim_approval_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY claim_approval_events_read ON public.claim_approval_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.claims c WHERE c.claim_id=claim_approval_events.claim_id));
GRANT SELECT ON public.claim_approval_events TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.claim_approval_events FROM anon, authenticated;

CREATE FUNCTION public.save_vendor_gst_master(p_token text,p_kind text,p_id text,p_values jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text; result_id uuid;
BEGIN
 actor := public.require_finance_session(p_token);
 IF p_kind='vendor' THEN
   IF nullif(trim(p_values->>'vendor_name'),'') IS NULL OR nullif(trim(p_values->>'short_form'),'') IS NULL OR nullif(trim(p_values->>'vendor_account_code'),'') IS NULL THEN
     RAISE EXCEPTION 'Vendor name, short form and SAP vendor account code are required';
   END IF;
   IF coalesce((p_values->>'active')::boolean,true) THEN
     IF p_id IS NULL OR p_id='' THEN
       INSERT INTO public.sap_vendors(vendor_name,short_form,vendor_account_code,active,created_by)
       VALUES(trim(p_values->>'vendor_name'),trim(p_values->>'short_form'),trim(p_values->>'vendor_account_code'),true,actor) RETURNING id INTO result_id;
     ELSE
       UPDATE public.sap_vendors SET vendor_name=trim(p_values->>'vendor_name'),short_form=trim(p_values->>'short_form'),
         vendor_account_code=trim(p_values->>'vendor_account_code'),active=true,updated_at=now() WHERE id=p_id::uuid RETURNING id INTO result_id;
     END IF;
   ELSE
     UPDATE public.sap_vendors SET active=false,updated_at=now() WHERE id=p_id::uuid RETURNING id INTO result_id;
   END IF;
   IF result_id IS NULL THEN RAISE EXCEPTION 'Vendor not found'; END IF;
 ELSIF p_kind='gst' THEN
   IF p_id NOT IN ('CGST','SGST','IGST') OR nullif(trim(p_values->>'gl_code'),'') IS NULL THEN RAISE EXCEPTION 'Valid GST type and GL code are required'; END IF;
   UPDATE public.sap_gst_accounts SET active=false,updated_at=now() WHERE gst_type=p_id AND active;
   INSERT INTO public.sap_gst_accounts(gst_type,gl_code,active) VALUES(p_id,trim(p_values->>'gl_code'),true) RETURNING id INTO result_id;
 ELSE RAISE EXCEPTION 'Unknown accounting master type'; END IF;
 INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
 VALUES('accounting_master_updated',actor,p_kind,coalesce(p_id,result_id::text),p_values::text);
 RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.save_vendor_gst_master(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_vendor_gst_master(text,text,text,jsonb) TO anon,authenticated;

CREATE FUNCTION public.verify_claim_accounting_rows(
 p_token text,p_claim_id text,p_expected_status text,p_amounts jsonb,p_expected_total numeric,
 p_accounting jsonb,p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text; entry jsonb; row_id uuid; item public.expense_items%ROWTYPE; approved numeric;
 taxable numeric; cgst numeric; sgst numeric; igst numeric; gst_total numeric; vendor public.sap_vendors%ROWTYPE; mapping_count integer;
BEGIN
 actor := public.require_finance_session(p_token);
 IF NOT EXISTS (SELECT 1 FROM public.users WHERE email=actor AND role IN ('Accounts','Admin','Super Admin')) THEN RAISE EXCEPTION 'Accounts access is required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.claims c JOIN public.users u ON u.email=c.user_email WHERE c.claim_id=p_claim_id AND nullif(trim(u.sap_gl_code),'') IS NOT NULL) THEN
   RAISE EXCEPTION 'Configure the employee SAP GL before Accounts verification';
 END IF;
 IF jsonb_typeof(p_accounting)<>'array' THEN RAISE EXCEPTION 'Accounting verification is required for each row'; END IF;
 IF jsonb_array_length(p_accounting)<>(SELECT count(*) FROM public.expense_items WHERE claim_id=p_claim_id)
    OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_accounting) x)<>jsonb_array_length(p_accounting) THEN
   RAISE EXCEPTION 'Complete accounting verification for every expense row';
 END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_accounting) LOOP
   IF coalesce(entry->>'has_tax_invoice','') NOT IN ('true','false') THEN RAISE EXCEPTION 'Choose Tax Invoice Yes or No for each row'; END IF;
   row_id := (entry->>'id')::uuid;
   SELECT * INTO item FROM public.expense_items WHERE id=row_id AND claim_id=p_claim_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Expense row not found'; END IF;
   approved := (p_amounts->>row_id::text)::numeric;
   IF approved>0 AND (entry->>'has_tax_invoice'='false' OR (entry->>'has_tax_invoice'='true' AND entry->>'vendor_available'='false')) THEN
     SELECT count(*) INTO mapping_count FROM public.app_lists a JOIN public.sap_expense_groups g ON g.code=a.sap_expense_group
     WHERE a.type='category' AND a.value=item.category AND a.active AND nullif(trim(g.gl_code),'') IS NOT NULL;
     IF mapping_count<>1 THEN RAISE EXCEPTION 'Map expense category "%" to exactly one configured SAP expense GL before verification',item.category; END IF;
   END IF;
   IF entry->>'has_tax_invoice'='true' THEN
     IF cardinality(coalesce(item.attachment_ids,'{}'))=0 THEN RAISE EXCEPTION 'A tax invoice must have an attached invoice or receipt'; END IF;
     IF entry->>'vendor_available'='true' THEN
       SELECT * INTO vendor FROM public.sap_vendors WHERE id=(entry->>'vendor_id')::uuid AND active;
       IF NOT FOUND THEN RAISE EXCEPTION 'Select an active SAP vendor'; END IF;
       UPDATE public.expense_items SET has_tax_invoice=true,vendor_available=true,vendor_id=vendor.id,
         vendor_account_code_snapshot=vendor.vendor_account_code,vendor_short_form_snapshot=vendor.short_form,
         taxable_amount=NULL,cgst_amount=NULL,sgst_amount=NULL,igst_amount=NULL,tax_amount=NULL,
         accounting_verified_by=actor,accounting_verified_at=now() WHERE id=row_id;
     ELSIF entry->>'vendor_available'='false' THEN
       taxable := (entry->>'taxable_amount')::numeric; cgst := coalesce(nullif(entry->>'cgst_amount','')::numeric,0);
       sgst := coalesce(nullif(entry->>'sgst_amount','')::numeric,0); igst := coalesce(nullif(entry->>'igst_amount','')::numeric,0);
       IF taxable IS NULL OR taxable<0 OR cgst<0 OR sgst<0 OR igst<0 OR taxable<>round(taxable,2) OR cgst<>round(cgst,2) OR sgst<>round(sgst,2) OR igst<>round(igst,2) THEN RAISE EXCEPTION 'Enter non-negative invoice amounts with at most two decimal places'; END IF;
       IF igst>0 AND (cgst>0 OR sgst>0) THEN RAISE EXCEPTION 'IGST cannot be combined with CGST or SGST'; END IF;
       gst_total := cgst+sgst+igst;
       IF round(taxable+gst_total,2)<>approved THEN RAISE EXCEPTION 'Taxable value plus GST must equal the approved expense amount'; END IF;
       IF cgst>0 AND NOT EXISTS(SELECT 1 FROM public.sap_gst_accounts WHERE gst_type='CGST' AND active) THEN RAISE EXCEPTION 'Configure Input CGST GL before verifying this invoice'; END IF;
       IF sgst>0 AND NOT EXISTS(SELECT 1 FROM public.sap_gst_accounts WHERE gst_type='SGST' AND active) THEN RAISE EXCEPTION 'Configure Input SGST GL before verifying this invoice'; END IF;
       IF igst>0 AND NOT EXISTS(SELECT 1 FROM public.sap_gst_accounts WHERE gst_type='IGST' AND active) THEN RAISE EXCEPTION 'Configure Input IGST GL before verifying this invoice'; END IF;
       UPDATE public.expense_items SET has_tax_invoice=true,vendor_available=false,vendor_id=NULL,
         vendor_account_code_snapshot=NULL,vendor_short_form_snapshot=NULL,taxable_amount=taxable,cgst_amount=cgst,
         sgst_amount=sgst,igst_amount=igst,tax_amount=gst_total,accounting_verified_by=actor,accounting_verified_at=now() WHERE id=row_id;
     ELSE RAISE EXCEPTION 'Choose whether the vendor is available in SAP'; END IF;
   ELSE
     UPDATE public.expense_items SET has_tax_invoice=false,vendor_available=NULL,vendor_id=NULL,vendor_account_code_snapshot=NULL,
       vendor_short_form_snapshot=NULL,taxable_amount=NULL,cgst_amount=NULL,sgst_amount=NULL,igst_amount=NULL,tax_amount=NULL,
       accounting_verified_by=actor,accounting_verified_at=now() WHERE id=row_id;
   END IF;
 END LOOP;
 PERFORM public.approve_claim_expense_rows(p_token,p_claim_id,'accounts',p_expected_status,p_amounts,p_expected_total,false,p_note);
END $$;
REVOKE ALL ON FUNCTION public.verify_claim_accounting_rows(text,text,text,jsonb,numeric,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_claim_accounting_rows(text,text,text,jsonb,numeric,jsonb,text) TO anon,authenticated;

CREATE FUNCTION public.capture_claim_approval_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE stage text; action_name text; actor text; event_time timestamptz; note text; actor_user public.users%ROWTYPE;
BEGIN
 IF NEW.manager_approval_date IS DISTINCT FROM OLD.manager_approval_date AND NEW.manager_approval_date IS NOT NULL THEN stage:='Manager'; action_name:=coalesce(NEW.manager_approval_status,'Approved'); actor:=coalesce(public.app_current_email(),NEW.manager_email); event_time:=now();
 ELSIF NEW.admin_approval_date IS DISTINCT FROM OLD.admin_approval_date AND NEW.admin_approval_date IS NOT NULL THEN stage:='Admin'; action_name:=CASE WHEN NEW.status='Rejected' THEN 'Rejected' ELSE 'Approved' END; actor:=coalesce(public.app_current_email(),NEW.admin_email); event_time:=now();
 ELSIF NEW.final_approval_date IS DISTINCT FROM OLD.final_approval_date AND NEW.final_approval_date IS NOT NULL THEN stage:='HOD / Super Admin'; action_name:='Approved'; actor:=coalesce(public.app_current_email(),NEW.final_approval_email); event_time:=now();
 ELSIF NEW.accounts_verified_date IS DISTINCT FROM OLD.accounts_verified_date AND NEW.accounts_verified_date IS NOT NULL THEN stage:='Accounts'; action_name:='Verified'; actor:=coalesce(public.app_current_email(),NEW.accounts_verified_email); event_time:=now(); note:=NEW.accounts_note;
 ELSIF NEW.paid_date IS DISTINCT FROM OLD.paid_date AND NEW.paid_date IS NOT NULL THEN stage:='Payment'; action_name:='Marked Paid'; actor:=coalesce(public.app_current_email(),NEW.paid_email); event_time:=now();
 ELSIF NEW.status='Rejected' AND OLD.status IS DISTINCT FROM NEW.status THEN stage:='Approval'; action_name:='Rejected'; actor:=public.app_current_email(); event_time:=now(); note:=NEW.rejection_reason;
 ELSE RETURN NEW; END IF;
 SELECT * INTO actor_user FROM public.users WHERE lower(email)=lower(actor) LIMIT 1;
 INSERT INTO public.claim_approval_events(claim_id,approval_stage,action,actor_email,actor_name,approved_at,user_agent,browser_name,operating_system,device_type,signature_snapshot_url,remarks)
 SELECT NEW.claim_id,stage,action_name,actor,actor_user.name,event_time,
   nullif(headers->>'user-agent',''),
   CASE WHEN headers->>'user-agent' ILIKE '%Edg/%' THEN 'Edge' WHEN headers->>'user-agent' ILIKE '%Chrome/%' THEN 'Chrome' WHEN headers->>'user-agent' ILIKE '%Firefox/%' THEN 'Firefox' WHEN headers->>'user-agent' ILIKE '%Safari/%' THEN 'Safari' ELSE NULL END,
   CASE WHEN headers->>'user-agent' ILIKE '%Windows%' THEN 'Windows' WHEN headers->>'user-agent' ILIKE '%Android%' THEN 'Android' WHEN headers->>'user-agent' ILIKE '%iPhone%' OR headers->>'user-agent' ILIKE '%iPad%' THEN 'iOS' WHEN headers->>'user-agent' ILIKE '%Mac OS%' THEN 'macOS' WHEN headers->>'user-agent' ILIKE '%Linux%' THEN 'Linux' ELSE NULL END,
   CASE WHEN headers->>'user-agent' ILIKE '%Mobile%' OR headers->>'user-agent' ILIKE '%Android%' OR headers->>'user-agent' ILIKE '%iPhone%' THEN 'Mobile' WHEN headers->>'user-agent' ILIKE '%iPad%' OR headers->>'user-agent' ILIKE '%Tablet%' THEN 'Tablet' WHEN headers->>'user-agent' IS NOT NULL THEN 'Desktop' ELSE NULL END,
   actor_user.signature_url,note
 FROM (SELECT coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb AS headers) request_context
 ON CONFLICT (claim_id,approval_stage,action) DO NOTHING;
 IF NEW.status='Rejected' AND OLD.status IS DISTINCT FROM NEW.status THEN
   INSERT INTO public.claim_approval_events(claim_id,approval_stage,action,actor_email,actor_name,approved_at,user_agent,signature_snapshot_url,remarks)
   SELECT NEW.claim_id,'Approval','Rejected',coalesce(public.app_current_email(),actor),actor_user.name,now(),headers->>'user-agent',actor_user.signature_url,NEW.rejection_reason
   FROM (SELECT coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb AS headers) request_context
   ON CONFLICT (claim_id,approval_stage,action) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_claim_approval_event AFTER UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.capture_claim_approval_event();

-- Enforce the posted account split against stored verification data at the point
-- the immutable export snapshot is inserted, even if a client modifies its preview.
CREATE FUNCTION public.validate_sap_export_accounting() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE claim_key text; employee_gl text; expected_debits jsonb; expected_credits jsonb; actual_debits jsonb; actual_credits jsonb;
  item record; journal record; detail record; account_code text; category_gl text; mapping_count integer;
  taxable numeric; cgst numeric; sgst numeric; igst numeric; amount numeric; gst_gl text; credit_total numeric;
BEGIN
 IF NEW.export_payload IS NULL THEN RETURN NEW; END IF;
 FOR claim_key IN SELECT x->>'claimId' FROM jsonb_array_elements(NEW.export_payload->'claims') x LOOP
   IF EXISTS(SELECT 1 FROM public.expense_items e WHERE e.claim_id=claim_key AND e.approved_amount IS NULL) THEN
     IF EXISTS(SELECT 1 FROM public.expense_items e WHERE e.claim_id=claim_key AND e.has_tax_invoice IS TRUE) THEN
       RAISE EXCEPTION 'Tax invoice rows require row-wise approval before export';
     END IF;
     -- Pre-row-approval legacy claims may have only a claim-level adjustment;
     -- their historical allocation is not recoverable from the submitted rows.
     CONTINUE;
   END IF;
   SELECT u.sap_gl_code INTO employee_gl FROM public.claims c JOIN public.users u ON u.email=c.user_email WHERE c.claim_id=claim_key;
   IF nullif(trim(employee_gl),'') IS NULL THEN RAISE EXCEPTION 'Configure employee SAP GL before export for claim %',claim_key; END IF;
   expected_debits:='{}'::jsonb; expected_credits:='{}'::jsonb; actual_debits:='{}'::jsonb; actual_credits:='{}'::jsonb; credit_total:=0;
   FOR item IN SELECT * FROM public.expense_items WHERE claim_id=claim_key LOOP
     amount:=coalesce(item.approved_amount,item.amount_with_bill+item.amount_without_bill);
     IF amount<0 OR amount<>round(amount,2) THEN RAISE EXCEPTION 'Invalid approved expense amount on claim %',claim_key; END IF;
     IF amount=0 THEN CONTINUE; END IF;
     IF item.has_tax_invoice IS TRUE AND item.vendor_available IS TRUE THEN
       IF item.vendor_id IS NULL OR nullif(trim(item.vendor_account_code_snapshot),'') IS NULL OR NOT EXISTS(SELECT 1 FROM public.sap_vendors v WHERE v.id=item.vendor_id AND v.active) THEN
         RAISE EXCEPTION 'Selected SAP vendor is missing or inactive on claim %',claim_key;
       END IF;
       account_code:=item.vendor_account_code_snapshot;
       expected_debits:=jsonb_set(expected_debits,ARRAY[account_code],to_jsonb(coalesce((expected_debits->>account_code)::numeric,0)+amount),true);
     ELSIF item.has_tax_invoice IS TRUE AND item.vendor_available IS FALSE THEN
       taxable:=item.taxable_amount; cgst:=coalesce(item.cgst_amount,0); sgst:=coalesce(item.sgst_amount,0); igst:=coalesce(item.igst_amount,0);
       IF taxable IS NULL OR taxable<0 OR cgst<0 OR sgst<0 OR igst<0 OR taxable<>round(taxable,2) OR cgst<>round(cgst,2) OR sgst<>round(sgst,2) OR igst<>round(igst,2) OR round(taxable+cgst+sgst+igst,2)<>amount OR (igst>0 AND (cgst>0 OR sgst>0)) THEN
         RAISE EXCEPTION 'Tax invoice amounts are invalid or do not balance on claim %',claim_key;
       END IF;
       IF taxable>0 THEN
         SELECT count(*),max(g.gl_code) INTO mapping_count,category_gl FROM public.app_lists a JOIN public.sap_expense_groups g ON g.code=a.sap_expense_group
         WHERE a.type='category' AND a.value=item.category AND nullif(trim(g.gl_code),'') IS NOT NULL
           AND (a.active OR NOT EXISTS(SELECT 1 FROM public.app_lists active_row WHERE active_row.type='category' AND active_row.value=item.category AND active_row.active));
         IF mapping_count<>1 THEN RAISE EXCEPTION 'Expense category GL is missing or ambiguous on claim %',claim_key; END IF;
         expected_debits:=jsonb_set(expected_debits,ARRAY[category_gl],to_jsonb(coalesce((expected_debits->>category_gl)::numeric,0)+taxable),true);
       END IF;
       FOR account_code,gst_gl IN SELECT gst.gst_type,gst.gl_code FROM public.sap_gst_accounts gst WHERE gst.active AND ((gst.gst_type='CGST' AND cgst>0) OR (gst.gst_type='SGST' AND sgst>0) OR (gst.gst_type='IGST' AND igst>0)) LOOP
         amount:=CASE account_code WHEN 'CGST' THEN cgst WHEN 'SGST' THEN sgst ELSE igst END;
         expected_debits:=jsonb_set(expected_debits,ARRAY[gst_gl],to_jsonb(coalesce((expected_debits->>gst_gl)::numeric,0)+amount),true);
       END LOOP;
       IF (cgst>0 AND NOT EXISTS(SELECT 1 FROM public.sap_gst_accounts WHERE gst_type='CGST' AND active)) OR
          (sgst>0 AND NOT EXISTS(SELECT 1 FROM public.sap_gst_accounts WHERE gst_type='SGST' AND active)) OR
          (igst>0 AND NOT EXISTS(SELECT 1 FROM public.sap_gst_accounts WHERE gst_type='IGST' AND active)) THEN
         RAISE EXCEPTION 'Required GST GL mapping is missing on claim %',claim_key;
       END IF;
     ELSIF item.has_tax_invoice IS TRUE THEN
       RAISE EXCEPTION 'Tax invoice vendor availability is missing on claim %',claim_key;
     ELSE
       SELECT count(*),max(g.gl_code) INTO mapping_count,category_gl FROM public.app_lists a JOIN public.sap_expense_groups g ON g.code=a.sap_expense_group
       WHERE a.type='category' AND a.value=item.category AND nullif(trim(g.gl_code),'') IS NOT NULL
         AND (a.active OR NOT EXISTS(SELECT 1 FROM public.app_lists active_row WHERE active_row.type='category' AND active_row.value=item.category AND active_row.active));
       IF mapping_count<>1 THEN RAISE EXCEPTION 'Expense category GL is missing or ambiguous on claim %',claim_key; END IF;
       expected_debits:=jsonb_set(expected_debits,ARRAY[category_gl],to_jsonb(coalesce((expected_debits->>category_gl)::numeric,0)+amount),true);
     END IF;
     credit_total:=credit_total+amount;
   END LOOP;
   IF credit_total<=0 THEN RAISE EXCEPTION 'Claim % has no approved expense amount',claim_key; END IF;
   expected_credits:=jsonb_set(expected_credits,ARRAY[employee_gl],to_jsonb(credit_total),true);
   FOR journal IN SELECT h.value->>0 AS journal_id FROM jsonb_array_elements(NEW.export_payload->'headers') WITH ORDINALITY h(value,n)
     WHERE n>2 AND NEW.export_payload->'journalClaims'->>((n-3)::integer)=claim_key LOOP
     FOR detail IN SELECT d.value FROM jsonb_array_elements(NEW.export_payload->'details') WITH ORDINALITY d(value,n) WHERE n>2 AND d.value->>0=journal.journal_id LOOP
       account_code:=nullif(trim(detail.value->>3),''); amount:=coalesce(nullif(detail.value->>4,'')::numeric,0);
       IF account_code IS NULL OR (amount>0 AND coalesce(nullif(detail.value->>5,'')::numeric,0)>0) THEN RAISE EXCEPTION 'Invalid debit or credit row in claim %',claim_key; END IF;
       IF amount>0 THEN actual_debits:=jsonb_set(actual_debits,ARRAY[account_code],to_jsonb(coalesce((actual_debits->>account_code)::numeric,0)+amount),true); END IF;
       amount:=coalesce(nullif(detail.value->>5,'')::numeric,0);
       IF amount>0 THEN actual_credits:=jsonb_set(actual_credits,ARRAY[account_code],to_jsonb(coalesce((actual_credits->>account_code)::numeric,0)+amount),true); END IF;
     END LOOP;
   END LOOP;
   IF actual_debits IS DISTINCT FROM expected_debits OR actual_credits IS DISTINCT FROM expected_credits THEN
     RAISE EXCEPTION 'SAP lines do not match the verified accounting classification for claim %',claim_key;
   END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_sap_export_accounting BEFORE INSERT ON public.sap_export_batches
FOR EACH ROW EXECUTE FUNCTION public.validate_sap_export_accounting();

COMMIT;
