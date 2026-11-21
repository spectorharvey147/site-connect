BEGIN;

CREATE OR REPLACE FUNCTION public.admin_correct_pending_claim_project(
  p_token TEXT,
  p_claim_id TEXT,
  p_site_name TEXT,
  p_customer_name TEXT,
  p_work_id UUID,
  p_expenses JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor TEXT;
  actor_role TEXT;
  claim_row RECORD;
  selected_project RECORD;
  selected_work_id UUID;
  selected_work_name TEXT;
  expense_edit JSONB;
  correction_rows JSONB := '[]'::jsonb;
  row_audit JSONB := '[]'::jsonb;
  expense_id UUID;
  expense_category TEXT;
  selected_code RECORD;
  selected_customer TEXT;
  row_customer TEXT;
  work_manager_email TEXT;
  work_required BOOLEAN;
  expense_count INTEGER;
BEGIN
  SELECT u.email, u.role INTO actor, actor_role
  FROM public.sessions s
  JOIN public.users u ON lower(u.email) = lower(s.user_email)
  WHERE s.token = p_token AND s.expires_at > now() AND u.active;

  IF actor IS NULL OR actor_role NOT IN ('Admin', 'Super Admin') THEN
    RAISE EXCEPTION 'Only Admin or Super Admin can correct project details during verification';
  END IF;

  SELECT * INTO claim_row
  FROM public.claims
  WHERE claim_id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND OR claim_row.status NOT IN ('Submitted', 'Pending Admin Verification') THEN
    RAISE EXCEPTION 'Project details can only be corrected while the claim is pending Admin verification';
  END IF;

  SELECT id, value, coalesce(customer_names, '{}'::text[]) AS customer_names,
         nullif(trim(coalesce(default_manager_email, '')), '') AS default_manager_email
  INTO selected_project
  FROM public.app_lists
  WHERE lower(type) = 'project' AND active AND value = trim(coalesce(p_site_name, ''));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active project';
  END IF;

  selected_customer := nullif(trim(coalesce(p_customer_name, '')), '');
  IF cardinality(selected_project.customer_names) = 1
     AND selected_customer IS DISTINCT FROM selected_project.customer_names[1] THEN
    RAISE EXCEPTION 'Customer name must match the selected project';
  END IF;
  IF cardinality(selected_project.customer_names) > 1
     AND (selected_customer IS NULL OR NOT (selected_customer = ANY(selected_project.customer_names))) THEN
    RAISE EXCEPTION 'Choose a customer mapped to the selected project';
  END IF;
  IF cardinality(selected_project.customer_names) = 0 THEN
    IF selected_customer IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.app_lists al
      WHERE lower(al.type) = 'projectcode' AND al.active
        AND (al.project = selected_project.value OR nullif(trim(coalesce(al.project, '')), '') IS NULL)
        AND selected_customer = ANY(coalesce(al.customer_names, '{}'::text[]))
    ) THEN
      RAISE EXCEPTION 'Choose a customer mapped to the selected project cost codes';
    END IF;
  END IF;

  SELECT coalesce(require_work_allocation, false) INTO work_required
  FROM public.company_settings
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;
  work_required := coalesce(work_required, false);

  IF p_work_id IS NULL THEN
    IF work_required THEN
      RAISE EXCEPTION 'Choose an active work activity for the selected project';
    END IF;
    work_manager_email := selected_project.default_manager_email;
  ELSE
    SELECT w.id, w.name,
           coalesce(nullif(trim(w.manager_email), ''), selected_project.default_manager_email) AS manager_email
    INTO selected_work_id, selected_work_name, work_manager_email
    FROM public.project_works w
    WHERE w.id = p_work_id AND w.project_id = selected_project.id AND w.active;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Choose an active work activity for the selected project';
    END IF;
  END IF;

  IF work_manager_email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(email) = lower(work_manager_email)
      AND active AND role IN ('Manager', 'Super Admin')
  ) THEN
    RAISE EXCEPTION 'The selected work has no active Manager or Super Admin';
  END IF;

  IF jsonb_typeof(p_expenses) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Expense project codes are required';
  END IF;

  SELECT count(*) INTO expense_count
  FROM public.expense_items
  WHERE claim_id = p_claim_id;

  IF jsonb_array_length(p_expenses) <> expense_count THEN
    RAISE EXCEPTION 'Refresh the claim before updating its project codes';
  END IF;

  FOR expense_edit IN SELECT value FROM jsonb_array_elements(p_expenses)
  LOOP
    expense_id := nullif(trim(coalesce(expense_edit->>'id', '')), '')::uuid;
    IF expense_id IS NULL THEN
      RAISE EXCEPTION 'An expense row is missing its ID';
    END IF;

    SELECT category INTO expense_category
    FROM public.expense_items
    WHERE id = expense_id AND claim_id = p_claim_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'An expense row does not belong to this claim';
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_expenses) rows(value)
      WHERE rows.value->>'id' = expense_edit->>'id'
      GROUP BY rows.value->>'id'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'An expense row was supplied more than once';
    END IF;

    row_customer := selected_customer;
    IF nullif(trim(coalesce(expense_edit->>'project_code', '')), '') IS NOT NULL THEN
      SELECT al.project_code, al.customer_names, al.allows_all_categories, al.expense_categories
      INTO selected_code
      FROM public.app_lists al
      WHERE lower(al.type) = 'projectcode'
        AND al.active
        AND al.project_code = trim(expense_edit->>'project_code')
        AND (al.project = selected_project.value OR nullif(trim(coalesce(al.project, '')), '') IS NULL)
      ORDER BY (al.project = selected_project.value) DESC
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Choose an active project cost code for the selected project';
      END IF;

      IF NOT coalesce(selected_code.allows_all_categories, true)
         AND NOT (expense_category = ANY(coalesce(selected_code.expense_categories, '{}'::text[]))) THEN
        RAISE EXCEPTION 'The selected project cost code is not allowed for expense category "%"', expense_category;
      END IF;

      IF cardinality(coalesce(selected_code.customer_names, '{}'::text[])) = 1 THEN
        row_customer := selected_code.customer_names[1];
      ELSIF cardinality(coalesce(selected_code.customer_names, '{}'::text[])) > 1 THEN
        IF selected_customer IS NULL OR NOT (selected_customer = ANY(selected_code.customer_names)) THEN
          RAISE EXCEPTION 'Choose a customer allowed by the selected project cost code';
        END IF;
        row_customer := selected_customer;
      END IF;
    END IF;

    correction_rows := correction_rows || jsonb_build_array(jsonb_build_object(
      'id', expense_id,
      'project_code', nullif(trim(coalesce(expense_edit->>'project_code', '')), ''),
      'customer_name', row_customer
    ));
  END LOOP;

  PERFORM set_config('siteconnect.claim_work_correction', 'true', true);
  UPDATE public.claims
  SET site_name = selected_project.value,
      customer_name = selected_customer,
      work_id = selected_work_id,
      work_name = selected_work_name,
      manager_email = work_manager_email
  WHERE claim_id = p_claim_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'expense_id', e.id,
    'previous_project_code', e.project_code,
    'project_code', rows.value->>'project_code',
    'previous_customer_name', e.customer_name,
    'customer_name', rows.value->>'customer_name'
  )), '[]'::jsonb)
  INTO row_audit
  FROM jsonb_array_elements(correction_rows) rows(value)
  JOIN public.expense_items e ON e.id = (rows.value->>'id')::uuid AND e.claim_id = p_claim_id;

  UPDATE public.expense_items e
  SET project_code = rows.value->>'project_code',
      customer_name = rows.value->>'customer_name'
  FROM jsonb_array_elements(correction_rows) rows(value)
  WHERE e.id = (rows.value->>'id')::uuid
    AND e.claim_id = p_claim_id
    AND (e.project_code IS DISTINCT FROM rows.value->>'project_code'
      OR e.customer_name IS DISTINCT FROM rows.value->>'customer_name');

  INSERT INTO public.audit_logs(action, performed_by, target_type, target_id, details)
  VALUES (
    'claim_project_corrected', actor, 'claim', p_claim_id,
    jsonb_build_object(
      'previous_site', claim_row.site_name,
      'site', selected_project.value,
      'previous_customer_name', claim_row.customer_name,
      'customer_name', selected_customer,
      'previous_work_id', claim_row.work_id,
      'previous_work_name', claim_row.work_name,
      'previous_manager_email', claim_row.manager_email,
      'work_id', selected_work_id,
      'work_name', selected_work_name,
      'manager_email', work_manager_email,
      'expenses', row_audit
    )::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_correct_pending_claim_project(TEXT, TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_correct_pending_claim_project(TEXT, TEXT, TEXT, TEXT, UUID, JSONB) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
