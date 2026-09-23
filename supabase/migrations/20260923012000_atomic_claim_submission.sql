BEGIN;
-- Seed the existing sequence from every claim, independent of caller visibility.
SELECT setval('public.claim_number_seq', greatest((SELECT last_value FROM public.claim_number_seq), coalesce((SELECT max(substring(claim_number from '^CLM-([0-9]+)$')::bigint) FROM public.claims),0)+1),false);
CREATE OR REPLACE FUNCTION public.submit_claim_secure(p_claim jsonb,p_expenses jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor text:=app_current_email(); actor_name text; claim_key text:=p_claim->>'claim_id'; number text;
 total_bill numeric; total_nobill numeric; balance numeric; file_path text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in to submit a claim'; END IF;
 IF jsonb_typeof(p_expenses) IS DISTINCT FROM 'array' OR jsonb_array_length(p_expenses) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Add valid expense rows'; END IF;
 IF claim_key IS NULL OR claim_key !~ '^C-[0-9]+$' THEN RAISE EXCEPTION 'Invalid claim ID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ledger:'||actor,0));
 SELECT name INTO actor_name FROM users WHERE email=actor AND active;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_expenses) e WHERE
  coalesce((e->>'amount_with_bill')::numeric,-1)<0 OR coalesce((e->>'amount_without_bill')::numeric,-1)<0 OR
  (e->>'amount_with_bill')::numeric+(e->>'amount_without_bill')::numeric<=0 OR
  (e->>'amount_with_bill')::numeric<>round((e->>'amount_with_bill')::numeric,2) OR
  (e->>'amount_without_bill')::numeric<>round((e->>'amount_without_bill')::numeric,2) OR
  (e->>'amount_with_bill')::numeric+(e->>'amount_without_bill')::numeric>=1000000000000 OR
  nullif(trim(e->>'category'),'') IS NULL) THEN RAISE EXCEPTION 'Expense amounts must be positive with at most two decimals'; END IF;
 -- An uploaded file must belong to this user or an earlier claim owned by them.
 FOR file_path IN SELECT value FROM jsonb_array_elements_text(coalesce(p_claim->'drive_file_ids','[]')) LOOP
  IF NOT EXISTS(SELECT 1 FROM storage_upload_owners WHERE bucket IN ('claim-attachments','claim-receipts') AND prefix=split_part(file_path,'/',1) AND user_email=actor)
   AND NOT EXISTS(SELECT 1 FROM claims WHERE user_email=actor AND file_path=ANY(drive_file_ids)) THEN RAISE EXCEPTION 'Attachment is not owned by this user'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_expenses) e, jsonb_array_elements_text(coalesce(e->'attachment_ids','[]')) f WHERE NOT (coalesce(p_claim->'drive_file_ids','[]') ? f.value)) THEN RAISE EXCEPTION 'Expense attachment is not included in the claim'; END IF;
 SELECT sum((e->>'amount_with_bill')::numeric),sum((e->>'amount_without_bill')::numeric) INTO total_bill,total_nobill FROM jsonb_array_elements(p_expenses) e;
 number:='CLM-'||lpad(nextval('claim_number_seq')::text,4,'0');
 -- lpad must not truncate larger sequence values.
 IF currval('claim_number_seq')>=10000 THEN number:='CLM-'||currval('claim_number_seq')::text; END IF;
 INSERT INTO claims(claim_id,claim_number,user_email,submitted_by,site_name,work_id,customer_name,status,manager_email,manager_approval_status,total_with_bill,total_without_bill,drive_file_ids)
 VALUES(claim_key,number,actor,actor_name,p_claim->>'site_name',nullif(p_claim->>'work_id','')::uuid,p_claim->>'customer_name','Submitted',
  (SELECT manager_email FROM users WHERE email=actor),'Not Started',total_bill,total_nobill,ARRAY(SELECT jsonb_array_elements_text(coalesce(p_claim->'drive_file_ids','[]'))));
 INSERT INTO expense_items(claim_id,category,project_code,customer_name,expense_date,description,amount_with_bill,amount_without_bill,attachment_ids)
 SELECT claim_key,e->>'category',e->>'project_code',e->>'customer_name',nullif(e->>'expense_date','')::date,e->>'description',(e->>'amount_with_bill')::numeric,(e->>'amount_without_bill')::numeric,ARRAY(SELECT jsonb_array_elements_text(coalesce(e->'attachment_ids','[]'))) FROM jsonb_array_elements(p_expenses) e;
 SELECT balance_after INTO balance FROM transactions WHERE user_email=actor ORDER BY created_at DESC,id DESC LIMIT 1;
 IF balance IS NULL THEN SELECT coalesce(advance_amount,0) INTO balance FROM users WHERE email=actor; END IF;
 INSERT INTO transactions(user_email,admin_email,type,reference_id,credit,debit,balance_after,description) VALUES(actor,actor,'claim_submitted',claim_key,0,total_bill+total_nobill,balance-total_bill-total_nobill,'Claim submission: '||number);
 RETURN number;
END $$;
REVOKE ALL ON FUNCTION public.submit_claim_secure(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_claim_secure(jsonb,jsonb) TO anon,authenticated;
-- Submission is now one validated transaction, not three public inserts.
DROP POLICY claims_insert ON public.claims;
DROP POLICY expenses_insert ON public.expense_items;
DROP POLICY transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions FOR INSERT WITH CHECK (app_current_role() IN ('Admin','Super Admin','Accounts') OR
 (app_current_role()='Manager' AND type='claim_rejected_refund' AND debit=0 AND EXISTS(SELECT 1 FROM claims c WHERE c.claim_id=reference_id AND c.manager_email=app_current_email() AND c.user_email=transactions.user_email AND c.status='Rejected' AND coalesce(c.verified_amount,c.grand_total)=credit)));
NOTIFY pgrst,'reload schema';
COMMIT;
