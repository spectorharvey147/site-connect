-- Allow additional expense ledgers and preserve their GL-specific report columns.
ALTER TABLE public.sap_expense_groups
  DROP CONSTRAINT IF EXISTS sap_expense_groups_code_check,
  DROP CONSTRAINT IF EXISTS sap_expense_groups_line_number_key;

CREATE FUNCTION public.save_expense_gl_master(p_token TEXT, p_id TEXT, p_values JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT;
  account_code TEXT;
  account_name TEXT;
  target_code TEXT;
BEGIN
  actor := public.require_finance_session(p_token, false);
  account_code := trim(coalesce(p_values->>'gl_code', ''));
  account_name := trim(coalesce(p_values->>'name', ''));
  IF account_code = '' THEN RAISE EXCEPTION 'Expense GL code is required'; END IF;
  IF account_name = '' THEN RAISE EXCEPTION 'Expense name is required'; END IF;
  IF p_id IS NULL OR trim(p_id) = '' THEN
    target_code := 'expense_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.sap_expense_groups(code,name,gl_code,line_number)
    VALUES(target_code,account_name,account_code,3);
  ELSE
    target_code := trim(p_id);
    UPDATE public.sap_expense_groups
       SET name = account_name, gl_code = account_code
     WHERE code = target_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'Expense GL account not found'; END IF;
  END IF;
  INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
  VALUES('accounting_master_updated',actor,'expense_gl',target_code,p_values::text);
END $$;

REVOKE ALL ON FUNCTION public.save_expense_gl_master(TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_expense_gl_master(TEXT,TEXT,JSONB) TO anon,authenticated;
