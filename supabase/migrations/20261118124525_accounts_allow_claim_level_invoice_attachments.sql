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
     IF cardinality(coalesce(item.attachment_ids,'{}'))=0 AND NOT EXISTS (SELECT 1 FROM public.claims c WHERE c.claim_id=p_claim_id AND cardinality(coalesce(c.drive_file_ids,'{}'))>0) THEN RAISE EXCEPTION 'A tax invoice must have an attached invoice or receipt to the claim'; END IF;
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