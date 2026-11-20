-- Expand the expense GL master while keeping codes non-empty and journal lines unique.
ALTER TABLE public.sap_expense_groups
  DROP CONSTRAINT IF EXISTS sap_expense_groups_code_check,
  DROP CONSTRAINT IF EXISTS sap_expense_groups_line_number_check;

ALTER TABLE public.sap_expense_groups
  ADD CONSTRAINT sap_expense_groups_code_nonempty_check CHECK (length(trim(code)) > 0),
  ADD CONSTRAINT sap_expense_groups_line_number_check CHECK (line_number BETWEEN 1 AND 32767);

-- Extend the existing finance-session-guarded RPC instead of adding a new public RPC.
CREATE OR REPLACE FUNCTION public.save_accounting_master(p_token TEXT, p_kind TEXT, p_id TEXT, p_values JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor TEXT; manager TEXT; project_uuid UUID; expense_code TEXT; expense_line INTEGER;
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
   IF trim(coalesce(p_values->>'gl_code','')) = '' THEN RAISE EXCEPTION 'Expense GL code is required'; END IF;
   UPDATE public.sap_expense_groups SET name = coalesce(nullif(trim(p_values->>'name'),''),name), gl_code = trim(p_values->>'gl_code') WHERE code = p_id;
 ELSIF p_kind = 'group_add' THEN
   IF trim(coalesce(p_values->>'name','')) = '' OR trim(coalesce(p_values->>'gl_code','')) = '' THEN RAISE EXCEPTION 'Expense name and GL code are required'; END IF;
   expense_code := 'expense_' || replace(gen_random_uuid()::text, '-', '');
   SELECT GREATEST(9, coalesce(max(line_number), 0)) + 1 INTO expense_line FROM public.sap_expense_groups;
   IF expense_line > 32767 THEN RAISE EXCEPTION 'No SAP journal line numbers are available'; END IF;
   INSERT INTO public.sap_expense_groups(code, name, gl_code, line_number)
   VALUES(expense_code, trim(p_values->>'name'), trim(p_values->>'gl_code'), expense_line);
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
 VALUES('accounting_master_updated',actor,p_kind,coalesce(expense_code,p_id),p_values::text);
END $$;
