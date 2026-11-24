BEGIN;
CREATE OR REPLACE FUNCTION public.admin_correct_pending_claim_expenses(
  p_token TEXT,
  p_claim_id TEXT,
  p_expenses JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $function$
DECLARE
  actor TEXT;
  actor_role TEXT;
  claim_status TEXT;
  claim_user_email TEXT;
  v_claim_number TEXT;
  old_total NUMERIC;
  new_total NUMERIC;
  current_balance NUMERIC;
  item JSONB;
  item_id UUID;
  selected_category TEXT;
  row_before public.expense_items%ROWTYPE;
  new_bill NUMERIC;
  new_no_bill NUMERIC;
  new_date DATE;
  new_description TEXT;
  changed_rows JSONB := '[]'::JSONB;
  claim_item_count INTEGER;
  submitted_item_count INTEGER;
BEGIN
  SELECT session_data->>'email',session_data->>'role' INTO actor,actor_role
  FROM (SELECT public.app_session(p_token) AS session_data) AS current_session;
  IF actor IS NULL OR actor_role NOT IN ('Admin','Super Admin') THEN
    RAISE EXCEPTION 'Only Admin or Super Admin can correct expense details during verification';
  END IF;
  IF jsonb_typeof(p_expenses) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Expense corrections must be supplied as a list';
  END IF;

  SELECT c.status,c.user_email,c.claim_number,coalesce(c.grand_total,0)
  INTO claim_status,claim_user_email,v_claim_number,old_total
  FROM public.claims c WHERE c.claim_id=p_claim_id FOR UPDATE;
  IF NOT FOUND OR claim_status NOT IN ('Submitted','Pending Admin Verification') THEN
    RAISE EXCEPTION 'Expense details can only be corrected while the claim is pending Admin verification';
  END IF;
  SELECT count(*) INTO claim_item_count FROM public.expense_items WHERE claim_id=p_claim_id;
  SELECT count(DISTINCT value->>'id') INTO submitted_item_count FROM jsonb_array_elements(p_expenses);
  IF claim_item_count=0 OR submitted_item_count<>claim_item_count OR jsonb_array_length(p_expenses)<>claim_item_count THEN
    RAISE EXCEPTION 'Reload this claim before saving its expense corrections';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_expenses) LOOP
    item_id := (item->>'id')::UUID;
    IF NOT EXISTS (SELECT 1 FROM public.expense_items WHERE id=item_id AND claim_id=p_claim_id) THEN
      RAISE EXCEPTION 'Expense row does not belong to this claim';
    END IF;
    SELECT value INTO selected_category FROM public.app_lists
    WHERE lower(type)='category' AND active AND value=trim(coalesce(item->>'category',''));
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active expense category for every row'; END IF;

    new_bill := (item->>'amount_with_bill')::NUMERIC;
    new_no_bill := (item->>'amount_without_bill')::NUMERIC;
    IF new_bill IS NULL OR new_no_bill IS NULL OR new_bill<0 OR new_no_bill<0 OR round(new_bill,2)<>new_bill OR round(new_no_bill,2)<>new_no_bill
       OR new_bill+new_no_bill<=0 OR new_bill+new_no_bill>=1000000000000 THEN
      RAISE EXCEPTION 'Each expense must have a positive total and nonnegative amounts with up to two decimal places';
    END IF;
    new_date := NULLIF(item->>'expense_date','')::DATE;
    new_description := NULLIF(trim(coalesce(item->>'description','')),'');

    SELECT * INTO row_before FROM public.expense_items WHERE id=item_id AND claim_id=p_claim_id FOR UPDATE;
    IF row_before.category IS DISTINCT FROM selected_category
      OR row_before.expense_date IS DISTINCT FROM new_date
      OR row_before.description IS DISTINCT FROM new_description
      OR row_before.amount_with_bill IS DISTINCT FROM new_bill
      OR row_before.amount_without_bill IS DISTINCT FROM new_no_bill THEN
      UPDATE public.expense_items
      SET category=selected_category,
          expense_date=new_date,
          description=new_description,
          amount_with_bill=new_bill,
          amount_without_bill=new_no_bill
      WHERE id=item_id AND claim_id=p_claim_id;
      changed_rows := changed_rows || jsonb_build_array(jsonb_build_object(
        'expense_id',item_id,
        'before',jsonb_build_object('category',row_before.category,'expense_date',row_before.expense_date,'description',row_before.description,'amount_with_bill',row_before.amount_with_bill,'amount_without_bill',row_before.amount_without_bill),
        'after',jsonb_build_object('category',selected_category,'expense_date',new_date,'description',new_description,'amount_with_bill',new_bill,'amount_without_bill',new_no_bill)
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(changed_rows)>0 THEN
    UPDATE public.claims
    SET total_with_bill=(SELECT coalesce(sum(amount_with_bill),0) FROM public.expense_items WHERE claim_id=p_claim_id),
        total_without_bill=(SELECT coalesce(sum(amount_without_bill),0) FROM public.expense_items WHERE claim_id=p_claim_id)
    WHERE claim_id=p_claim_id;

    SELECT coalesce(grand_total,0) INTO new_total FROM public.claims WHERE claim_id=p_claim_id;
    IF new_total IS DISTINCT FROM old_total THEN
      SELECT balance_after INTO current_balance FROM public.transactions
      WHERE lower(user_email)=lower(claim_user_email)
      ORDER BY created_at DESC,id DESC LIMIT 1;
      IF current_balance IS NULL THEN
        SELECT coalesce(advance_amount,0) INTO current_balance FROM public.users WHERE lower(email)=lower(claim_user_email);
      END IF;
      INSERT INTO public.transactions(user_email,admin_email,type,reference_id,credit,debit,balance_after,description)
      VALUES(claim_user_email,actor,'claim_expense_amounts_corrected',p_claim_id,
        greatest(old_total-new_total,0),greatest(new_total-old_total,0),
        coalesce(current_balance,0)+old_total-new_total,
        'Admin expense correction: '||coalesce(v_claim_number,p_claim_id));
    END IF;

    INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
    VALUES('claim_expense_details_corrected',actor,'claim',p_claim_id,jsonb_build_object('expenses',changed_rows)::TEXT);
  END IF;
END $function$;
DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions FOR INSERT WITH CHECK (
  app_current_role() IN ('Admin','Master Admin','Accounts')
  OR (
    app_current_role()='Super Admin'
    AND type='claim_expense_amounts_corrected'
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.claim_id=transactions.reference_id
        AND (c.department_id=app_current_department_id() OR c.department_id IS NULL)
    )
  )
  OR (
    app_current_role()='Manager'
    AND type='claim_rejected_refund'
    AND debit=0
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.claim_id=transactions.reference_id
        AND c.manager_email=app_current_email()
        AND c.user_email=transactions.user_email
        AND c.status='Rejected'
        AND coalesce(c.verified_amount,c.grand_total)=credit
    )
  )
);
NOTIFY pgrst,'reload schema';
COMMIT;
