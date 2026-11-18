BEGIN;

ALTER TABLE public.expense_items
  ADD COLUMN vendor_allocations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT expense_vendor_allocations_is_array CHECK (jsonb_typeof(vendor_allocations) = 'array');

CREATE OR REPLACE FUNCTION public.protect_exported_expense_accounting() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.claims WHERE claim_id=OLD.claim_id AND sap_exported)
    AND ROW(NEW.has_tax_invoice,NEW.vendor_available,NEW.vendor_id,NEW.vendor_account_code_snapshot,NEW.vendor_short_form_snapshot,
      NEW.vendor_allocations,NEW.taxable_amount,NEW.cgst_amount,NEW.sgst_amount,NEW.igst_amount,NEW.tax_amount,NEW.accounting_verified_by,NEW.accounting_verified_at)
      IS DISTINCT FROM ROW(OLD.has_tax_invoice,OLD.vendor_available,OLD.vendor_id,OLD.vendor_account_code_snapshot,OLD.vendor_short_form_snapshot,
      OLD.vendor_allocations,OLD.taxable_amount,OLD.cgst_amount,OLD.sgst_amount,OLD.igst_amount,OLD.tax_amount,OLD.accounting_verified_by,OLD.accounting_verified_at) THEN
   RAISE EXCEPTION 'Exported expense accounting classification is immutable';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.verify_claim_accounting_rows(
 p_token text,p_claim_id text,p_expected_status text,p_amounts jsonb,p_expected_total numeric,
 p_accounting jsonb,p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 actor text; entry jsonb; row_id uuid; item public.expense_items%ROWTYPE; approved numeric;
 taxable numeric; cgst numeric; sgst numeric; igst numeric; gst_total numeric; vendor public.sap_vendors%ROWTYPE;
 allocation jsonb; allocations jsonb; allocation_amount numeric; allocation_total numeric; seen_vendors uuid[];
 mapping_count integer; first_vendor public.sap_vendors%ROWTYPE;
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
   IF approved IS NULL OR approved<0 OR approved<>round(approved,2) THEN RAISE EXCEPTION 'Enter a valid approved amount for each row'; END IF;
   IF approved>0 AND (entry->>'has_tax_invoice'='false' OR (entry->>'has_tax_invoice'='true' AND entry->>'vendor_available'='false')) THEN
     SELECT count(*) INTO mapping_count FROM public.app_lists a JOIN public.sap_expense_groups g ON g.code=a.sap_expense_group
     WHERE a.type='category' AND a.value=item.category AND a.active AND nullif(trim(g.gl_code),'') IS NOT NULL;
     IF mapping_count<>1 THEN RAISE EXCEPTION 'Map expense category "%" to exactly one configured SAP expense GL before verification',item.category; END IF;
   END IF;
   IF entry->>'has_tax_invoice'='true' THEN
     IF cardinality(coalesce(item.attachment_ids,'{}'))=0 THEN RAISE EXCEPTION 'A tax invoice must have an attached invoice or receipt'; END IF;
     IF entry->>'vendor_available'='true' THEN
       allocations:=coalesce(entry->'vendor_allocations','[]'::jsonb);
       IF jsonb_typeof(allocations)<>'array' OR jsonb_array_length(allocations)=0 THEN RAISE EXCEPTION 'Add at least one vendor allocation'; END IF;
       allocation_total:=0; seen_vendors:='{}'; first_vendor:=NULL; allocations:='[]'::jsonb;
       FOR allocation IN SELECT value FROM jsonb_array_elements(coalesce(entry->'vendor_allocations','[]'::jsonb)) LOOP
         IF nullif(allocation->>'vendor_id','') IS NULL OR nullif(allocation->>'amount','') IS NULL THEN RAISE EXCEPTION 'Select a vendor and enter its invoice amount'; END IF;
         SELECT * INTO vendor FROM public.sap_vendors WHERE id=(allocation->>'vendor_id')::uuid AND active;
         IF NOT FOUND THEN RAISE EXCEPTION 'Select an active SAP vendor'; END IF;
         IF vendor.id=ANY(seen_vendors) THEN RAISE EXCEPTION 'Each vendor can appear only once per expense row'; END IF;
         allocation_amount:=(allocation->>'amount')::numeric;
         IF allocation_amount<=0 OR allocation_amount<>round(allocation_amount,2) THEN RAISE EXCEPTION 'Vendor invoice amounts must be positive and have at most two decimal places'; END IF;
         allocation_total:=allocation_total+allocation_amount; seen_vendors:=array_append(seen_vendors,vendor.id);
         IF first_vendor.id IS NULL THEN first_vendor:=vendor; END IF;
         allocations:=allocations||jsonb_build_array(jsonb_build_object('vendor_id',vendor.id,'vendor_account_code_snapshot',vendor.vendor_account_code,'vendor_short_form_snapshot',vendor.short_form,'amount',allocation_amount));
       END LOOP;
       IF allocation_total>approved THEN RAISE EXCEPTION 'Vendor invoice amounts cannot exceed the approved expense amount'; END IF;
       IF allocation_total<approved THEN
         SELECT count(*) INTO mapping_count FROM public.app_lists a JOIN public.sap_expense_groups g ON g.code=a.sap_expense_group
         WHERE a.type='category' AND a.value=item.category AND a.active AND nullif(trim(g.gl_code),'') IS NOT NULL;
         IF mapping_count<>1 THEN RAISE EXCEPTION 'Map expense category "%" to exactly one configured SAP expense GL for the remaining balance',item.category; END IF;
       END IF;
       UPDATE public.expense_items SET has_tax_invoice=true,vendor_available=true,vendor_id=first_vendor.id,
         vendor_account_code_snapshot=first_vendor.vendor_account_code,vendor_short_form_snapshot=first_vendor.short_form,
         vendor_allocations=allocations,taxable_amount=NULL,cgst_amount=NULL,sgst_amount=NULL,igst_amount=NULL,tax_amount=NULL,
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
       UPDATE public.expense_items SET has_tax_invoice=true,vendor_available=false,vendor_id=NULL,vendor_allocations='[]'::jsonb,
         vendor_account_code_snapshot=NULL,vendor_short_form_snapshot=NULL,taxable_amount=taxable,cgst_amount=cgst,
         sgst_amount=sgst,igst_amount=igst,tax_amount=gst_total,accounting_verified_by=actor,accounting_verified_at=now() WHERE id=row_id;
     ELSE RAISE EXCEPTION 'Choose whether the vendor is available in SAP'; END IF;
   ELSE
     UPDATE public.expense_items SET has_tax_invoice=false,vendor_available=NULL,vendor_id=NULL,vendor_allocations='[]'::jsonb,
       vendor_account_code_snapshot=NULL,vendor_short_form_snapshot=NULL,taxable_amount=NULL,cgst_amount=NULL,sgst_amount=NULL,igst_amount=NULL,tax_amount=NULL,
       accounting_verified_by=actor,accounting_verified_at=now() WHERE id=row_id;
   END IF;
 END LOOP;
 PERFORM public.approve_claim_expense_rows(p_token,p_claim_id,'accounts',p_expected_status,p_amounts,p_expected_total,false,p_note);
END $$;

CREATE OR REPLACE FUNCTION public.validate_sap_export_accounting() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
 claim_key text; employee_gl text; expected_debits jsonb; expected_credits jsonb; actual_debits jsonb; actual_credits jsonb;
 item record; journal record; detail record; account_code text; category_gl text; mapping_count integer;
 taxable numeric; cgst numeric; sgst numeric; igst numeric; amount numeric; gst_gl text; credit_total numeric;
 allocation jsonb; allocation_total numeric; allocation_amount numeric; vendor_row public.sap_vendors%ROWTYPE;
BEGIN
 IF NEW.export_payload IS NULL THEN RETURN NEW; END IF;
 FOR claim_key IN SELECT x->>'claimId' FROM jsonb_array_elements(NEW.export_payload->'claims') x LOOP
   IF EXISTS(SELECT 1 FROM public.expense_items e WHERE e.claim_id=claim_key AND e.approved_amount IS NULL) THEN
     IF EXISTS(SELECT 1 FROM public.expense_items e WHERE e.claim_id=claim_key AND e.has_tax_invoice IS TRUE) THEN RAISE EXCEPTION 'Tax invoice rows require row-wise approval before export'; END IF;
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
       allocation_total:=0;
       IF jsonb_typeof(item.vendor_allocations)='array' AND jsonb_array_length(item.vendor_allocations)>0 THEN
         FOR allocation IN SELECT value FROM jsonb_array_elements(item.vendor_allocations) LOOP
           SELECT * INTO vendor_row FROM public.sap_vendors WHERE id=(allocation->>'vendor_id')::uuid AND active;
           allocation_amount:=(allocation->>'amount')::numeric;
           IF NOT FOUND OR allocation_amount<=0 OR allocation_amount<>round(allocation_amount,2)
             OR allocation->>'vendor_account_code_snapshot' IS DISTINCT FROM vendor_row.vendor_account_code
             OR allocation->>'vendor_short_form_snapshot' IS DISTINCT FROM vendor_row.short_form THEN
             RAISE EXCEPTION 'Selected SAP vendor allocation is missing, changed or invalid on claim %',claim_key;
           END IF;
           account_code:=vendor_row.vendor_account_code;
           expected_debits:=jsonb_set(expected_debits,ARRAY[account_code],to_jsonb(coalesce((expected_debits->>account_code)::numeric,0)+allocation_amount),true);
           allocation_total:=allocation_total+allocation_amount;
         END LOOP;
         IF allocation_total>amount THEN RAISE EXCEPTION 'Vendor allocations exceed the approved row amount on claim %',claim_key; END IF;
         IF amount-allocation_total>0 THEN
           SELECT count(*),max(g.gl_code) INTO mapping_count,category_gl FROM public.app_lists a JOIN public.sap_expense_groups g ON g.code=a.sap_expense_group
           WHERE a.type='category' AND a.value=item.category AND nullif(trim(g.gl_code),'') IS NOT NULL
             AND (a.active OR NOT EXISTS(SELECT 1 FROM public.app_lists active_row WHERE active_row.type='category' AND active_row.value=item.category AND active_row.active));
           IF mapping_count<>1 THEN RAISE EXCEPTION 'Expense category GL is missing or ambiguous on claim %',claim_key; END IF;
           expected_debits:=jsonb_set(expected_debits,ARRAY[category_gl],to_jsonb(coalesce((expected_debits->>category_gl)::numeric,0)+(amount-allocation_total)),true);
         END IF;
       ELSE
         IF item.vendor_id IS NULL OR nullif(trim(item.vendor_account_code_snapshot),'') IS NULL OR NOT EXISTS(SELECT 1 FROM public.sap_vendors v WHERE v.id=item.vendor_id AND v.active) THEN RAISE EXCEPTION 'Selected SAP vendor is missing or inactive on claim %',claim_key; END IF;
         account_code:=item.vendor_account_code_snapshot;
         expected_debits:=jsonb_set(expected_debits,ARRAY[account_code],to_jsonb(coalesce((expected_debits->>account_code)::numeric,0)+amount),true);
       END IF;
     ELSIF item.has_tax_invoice IS TRUE AND item.vendor_available IS FALSE THEN
       taxable:=item.taxable_amount; cgst:=coalesce(item.cgst_amount,0); sgst:=coalesce(item.sgst_amount,0); igst:=coalesce(item.igst_amount,0);
       IF taxable IS NULL OR taxable<0 OR cgst<0 OR sgst<0 OR igst<0 OR taxable<>round(taxable,2) OR cgst<>round(cgst,2) OR sgst<>round(sgst,2) OR igst<>round(igst,2) OR round(taxable+cgst+sgst+igst,2)<>amount OR (igst>0 AND (cgst>0 OR sgst>0)) THEN RAISE EXCEPTION 'Tax invoice amounts are invalid or do not balance on claim %',claim_key; END IF;
       IF taxable>0 THEN
         SELECT count(*),max(g.gl_code) INTO mapping_count,category_gl FROM public.app_lists a JOIN public.sap_expense_groups g ON g.code=a.sap_expense_group
         WHERE a.type='category' AND a.value=item.category AND nullif(trim(g.gl_code),'') IS NOT NULL AND (a.active OR NOT EXISTS(SELECT 1 FROM public.app_lists active_row WHERE active_row.type='category' AND active_row.value=item.category AND active_row.active));
         IF mapping_count<>1 THEN RAISE EXCEPTION 'Expense category GL is missing or ambiguous on claim %',claim_key; END IF;
         expected_debits:=jsonb_set(expected_debits,ARRAY[category_gl],to_jsonb(coalesce((expected_debits->>category_gl)::numeric,0)+taxable),true);
       END IF;
       FOR account_code,gst_gl IN SELECT gst.gst_type,gst.gl_code FROM public.sap_gst_accounts gst WHERE gst.active AND ((gst.gst_type='CGST' AND cgst>0) OR (gst.gst_type='SGST' AND sgst>0) OR (gst.gst_type='IGST' AND igst>0)) LOOP
         amount:=CASE account_code WHEN 'CGST' THEN cgst WHEN 'SGST' THEN sgst ELSE igst END;
         expected_debits:=jsonb_set(expected_debits,ARRAY[gst_gl],to_jsonb(coalesce((expected_debits->>gst_gl)::numeric,0)+amount),true);
       END LOOP;
       IF (cgst>0 AND NOT EXISTS(SELECT 1 FROM public.sap_gst_accounts WHERE gst_type='CGST' AND active)) OR (sgst>0 AND NOT EXISTS(SELECT 1 FROM public.sap_gst_accounts WHERE gst_type='SGST' AND active)) OR (igst>0 AND NOT EXISTS(SELECT 1 FROM public.sap_gst_accounts WHERE gst_type='IGST' AND active)) THEN RAISE EXCEPTION 'Required GST GL mapping is missing on claim %',claim_key; END IF;
     ELSIF item.has_tax_invoice IS TRUE THEN
       RAISE EXCEPTION 'Tax invoice vendor availability is missing on claim %',claim_key;
     ELSE
       SELECT count(*),max(g.gl_code) INTO mapping_count,category_gl FROM public.app_lists a JOIN public.sap_expense_groups g ON g.code=a.sap_expense_group
       WHERE a.type='category' AND a.value=item.category AND nullif(trim(g.gl_code),'') IS NOT NULL AND (a.active OR NOT EXISTS(SELECT 1 FROM public.app_lists active_row WHERE active_row.type='category' AND active_row.value=item.category AND active_row.active));
       IF mapping_count<>1 THEN RAISE EXCEPTION 'Expense category GL is missing or ambiguous on claim %',claim_key; END IF;
       expected_debits:=jsonb_set(expected_debits,ARRAY[category_gl],to_jsonb(coalesce((expected_debits->>category_gl)::numeric,0)+amount),true);
     END IF;
     credit_total:=credit_total+coalesce(item.approved_amount,item.amount_with_bill+item.amount_without_bill);
   END LOOP;
   IF credit_total<=0 THEN RAISE EXCEPTION 'Claim % has no approved expense amount',claim_key; END IF;
   expected_credits:=jsonb_set(expected_credits,ARRAY[employee_gl],to_jsonb(credit_total),true);
   FOR journal IN SELECT h.value->>0 AS journal_id FROM jsonb_array_elements(NEW.export_payload->'headers') WITH ORDINALITY h(value,n) WHERE n>2 AND NEW.export_payload->'journalClaims'->>((n-3)::integer)=claim_key LOOP
     FOR detail IN SELECT d.value FROM jsonb_array_elements(NEW.export_payload->'details') WITH ORDINALITY d(value,n) WHERE n>2 AND d.value->>0=journal.journal_id LOOP
       account_code:=nullif(trim(detail.value->>3),''); amount:=coalesce(nullif(detail.value->>4,'')::numeric,0);
       IF account_code IS NULL OR (amount>0 AND coalesce(nullif(detail.value->>5,'')::numeric,0)>0) THEN RAISE EXCEPTION 'Invalid debit or credit row in claim %',claim_key; END IF;
       IF amount>0 THEN actual_debits:=jsonb_set(actual_debits,ARRAY[account_code],to_jsonb(coalesce((actual_debits->>account_code)::numeric,0)+amount),true); END IF;
       amount:=coalesce(nullif(detail.value->>5,'')::numeric,0);
       IF amount>0 THEN actual_credits:=jsonb_set(actual_credits,ARRAY[account_code],to_jsonb(coalesce((actual_credits->>account_code)::numeric,0)+amount),true); END IF;
     END LOOP;
   END LOOP;
   IF actual_debits IS DISTINCT FROM expected_debits OR actual_credits IS DISTINCT FROM expected_credits THEN RAISE EXCEPTION 'SAP lines do not match the verified accounting classification for claim %',claim_key; END IF;
 END LOOP;
 RETURN NEW;
END $$;

COMMIT;
