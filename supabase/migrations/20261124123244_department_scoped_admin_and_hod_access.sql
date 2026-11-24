BEGIN;

-- Department Admins and HODs are department-scoped. Only central Accounts and
-- Master Admin retain cross-department read access.
DROP POLICY IF EXISTS users_read ON public.users;
CREATE POLICY users_read ON public.users FOR SELECT USING (
  email = public.app_current_email()
  OR public.app_current_role() IN ('Accounts', 'Master Admin')
  OR (
    public.app_current_role() IN ('Admin', 'Super Admin')
    AND public.app_current_department_id() IS NOT NULL
    AND department_id = public.app_current_department_id()
  )
  OR (
    public.app_current_role() NOT IN ('Admin', 'Super Admin', 'Accounts', 'Master Admin')
    AND public.app_current_department_id() IS NOT NULL
    AND department_id = public.app_current_department_id()
  )
);

DROP POLICY IF EXISTS users_insert ON public.users;
CREATE POLICY users_insert ON public.users FOR INSERT WITH CHECK (
  public.app_current_role() = 'Master Admin'
  OR (
    public.app_current_role() IN ('Admin', 'Super Admin')
    AND public.app_current_department_id() IS NOT NULL
    AND (department_id IS NULL OR department_id = public.app_current_department_id())
  )
);

DROP POLICY IF EXISTS users_update ON public.users;
CREATE POLICY users_update ON public.users FOR UPDATE
  USING (
    email = public.app_current_email()
    OR public.app_current_role() = 'Master Admin'
    OR (
      public.app_current_role() IN ('Admin', 'Super Admin')
      AND public.app_current_department_id() IS NOT NULL
      AND department_id = public.app_current_department_id()
    )
  )
  WITH CHECK (
    email = public.app_current_email()
    OR public.app_current_role() = 'Master Admin'
    OR (
      public.app_current_role() IN ('Admin', 'Super Admin')
      AND public.app_current_department_id() IS NOT NULL
      AND department_id = public.app_current_department_id()
    )
  );

DROP POLICY IF EXISTS users_delete ON public.users;
CREATE POLICY users_delete ON public.users FOR DELETE USING (
  public.app_current_role() = 'Master Admin'
  OR (
    public.app_current_role() = 'Super Admin'
    AND public.app_current_department_id() IS NOT NULL
    AND department_id = public.app_current_department_id()
  )
);

DROP POLICY IF EXISTS claims_read ON public.claims;
CREATE POLICY claims_read ON public.claims FOR SELECT USING (
  public.app_current_role() IN ('Accounts', 'Master Admin')
  OR (
    public.app_current_department_id() IS NOT NULL
    AND department_id = public.app_current_department_id()
    AND (
      public.app_current_role() IN ('Admin', 'Super Admin')
      OR user_email = public.app_current_email()
      OR manager_email = public.app_current_email()
    )
  )
);

DROP POLICY IF EXISTS claims_update ON public.claims;
CREATE POLICY claims_update ON public.claims FOR UPDATE
  USING (
    public.app_current_role() IN ('Accounts', 'Master Admin')
    OR (
      public.app_current_role() IN ('Admin', 'Super Admin')
      AND public.app_current_department_id() IS NOT NULL
      AND department_id = public.app_current_department_id()
    )
    OR (
      public.app_current_role() = 'Manager'
      AND public.app_current_department_id() IS NOT NULL
      AND department_id = public.app_current_department_id()
      AND manager_email = public.app_current_email()
      AND status IN ('Admin Verified', 'Pending Manager Approval')
    )
  )
  WITH CHECK (
    public.app_current_role() IN ('Accounts', 'Master Admin')
    OR (
      public.app_current_role() IN ('Admin', 'Super Admin')
      AND public.app_current_department_id() IS NOT NULL
      AND department_id = public.app_current_department_id()
    )
    OR (
      public.app_current_role() = 'Manager'
      AND public.app_current_department_id() IS NOT NULL
      AND department_id = public.app_current_department_id()
      AND manager_email = public.app_current_email()
      AND status IN ('Manager Approved', 'Rejected')
    )
  );

DROP POLICY IF EXISTS claims_delete ON public.claims;
CREATE POLICY claims_delete ON public.claims FOR DELETE USING (
  public.app_current_role() = 'Master Admin'
  OR (
    public.app_current_role() = 'Super Admin'
    AND public.app_current_department_id() IS NOT NULL
    AND department_id = public.app_current_department_id()
  )
);

DROP POLICY IF EXISTS expenses_read ON public.expense_items;
CREATE POLICY expenses_read ON public.expense_items FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.claims c
    WHERE c.claim_id = expense_items.claim_id
  )
);

DROP POLICY IF EXISTS expenses_update ON public.expense_items;
CREATE POLICY expenses_update ON public.expense_items FOR UPDATE
  USING (
    public.app_current_role() = 'Master Admin'
    OR (
      public.app_current_role() IN ('Admin', 'Super Admin')
      AND public.app_current_department_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.claims c
        WHERE c.claim_id = expense_items.claim_id
          AND c.department_id = public.app_current_department_id()
      )
    )
  )
  WITH CHECK (
    public.app_current_role() = 'Master Admin'
    OR (
      public.app_current_role() IN ('Admin', 'Super Admin')
      AND public.app_current_department_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.claims c
        WHERE c.claim_id = expense_items.claim_id
          AND c.department_id = public.app_current_department_id()
      )
    )
  );

DROP POLICY IF EXISTS expenses_delete ON public.expense_items;
CREATE POLICY expenses_delete ON public.expense_items FOR DELETE USING (
  public.app_current_role() = 'Master Admin'
  OR (
    public.app_current_role() = 'Super Admin'
    AND public.app_current_department_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.claim_id = expense_items.claim_id
        AND c.department_id = public.app_current_department_id()
    )
  )
);

DROP POLICY IF EXISTS transactions_read ON public.transactions;
CREATE POLICY transactions_read ON public.transactions FOR SELECT USING (
  public.app_current_role() IN ('Accounts', 'Master Admin')
  OR (
    public.app_current_department_id() IS NOT NULL
    AND (
      (
        public.app_current_role() IN ('Admin', 'Super Admin')
        AND EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.email = transactions.user_email
            AND u.department_id = public.app_current_department_id()
        )
      )
      OR (
        public.app_current_role() NOT IN ('Admin', 'Super Admin', 'Accounts', 'Master Admin')
        AND transactions.user_email = public.app_current_email()
      )
      OR (
        public.app_current_role() = 'Manager'
        AND EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.email = transactions.user_email
            AND u.manager_email = public.app_current_email()
            AND u.department_id = public.app_current_department_id()
        )
      )
    )
  )
);

DROP POLICY IF EXISTS transactions_insert ON public.transactions;
CREATE POLICY transactions_insert ON public.transactions FOR INSERT WITH CHECK (
  public.app_current_role() IN ('Accounts', 'Master Admin')
  OR (
    public.app_current_role() = 'Admin'
    AND public.app_current_department_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.claim_id = transactions.reference_id
        AND c.department_id = public.app_current_department_id()
    )
  )
  OR (
    public.app_current_role() = 'Super Admin'
    AND transactions.type = 'claim_expense_amounts_corrected'
    AND public.app_current_department_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.claim_id = transactions.reference_id
        AND c.department_id = public.app_current_department_id()
    )
  )
  OR (
    public.app_current_role() = 'Manager'
    AND transactions.type = 'claim_rejected_refund'
    AND transactions.debit = 0
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.claim_id = transactions.reference_id
        AND c.department_id = public.app_current_department_id()
        AND c.manager_email = public.app_current_email()
        AND c.user_email = transactions.user_email
        AND c.status = 'Rejected'
        AND coalesce(c.verified_amount, c.grand_total) = transactions.credit
    )
  )
);

DROP POLICY IF EXISTS transactions_update ON public.transactions;
CREATE POLICY transactions_update ON public.transactions FOR UPDATE
  USING (public.app_current_role() IN ('Accounts', 'Master Admin'))
  WITH CHECK (public.app_current_role() IN ('Accounts', 'Master Admin'));

DROP POLICY IF EXISTS transactions_delete ON public.transactions;
CREATE POLICY transactions_delete ON public.transactions FOR DELETE USING (
  public.app_current_role() = 'Master Admin'
  OR (
    public.app_current_role() = 'Super Admin'
    AND public.app_current_department_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.email = transactions.user_email
        AND u.department_id = public.app_current_department_id()
    )
  )
);

DROP POLICY IF EXISTS audit_read ON public.audit_logs;
CREATE POLICY audit_read ON public.audit_logs FOR SELECT USING (
  public.app_current_role() IN ('Accounts', 'Master Admin')
  OR (
    public.app_current_role() IN ('Admin', 'Super Admin')
    AND public.app_current_department_id() IS NOT NULL
    AND target_type = 'claim'
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.claim_id = audit_logs.target_id
        AND c.department_id = public.app_current_department_id()
    )
  )
  OR (
    public.app_current_role() NOT IN ('Admin', 'Super Admin', 'Accounts', 'Master Admin')
    AND performed_by = public.app_current_email()
  )
  OR (
    public.app_current_role() NOT IN ('Admin', 'Super Admin', 'Accounts', 'Master Admin')
    AND public.app_current_department_id() IS NOT NULL
    AND target_type = 'claim'
    AND EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.claim_id = audit_logs.target_id
        AND c.department_id = public.app_current_department_id()
        AND (c.user_email = public.app_current_email() OR c.manager_email = public.app_current_email())
    )
  )
);

-- SECURITY DEFINER RPCs are used by the client for claim corrections and approvals.
-- Enforce the department from the active request session even when those RPCs
-- execute with elevated database privileges.
CREATE OR REPLACE FUNCTION public.assert_claim_department_write_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.app_current_role() IN ('Admin', 'Super Admin')
     AND (
       public.app_current_department_id() IS NULL
       OR NEW.department_id IS DISTINCT FROM public.app_current_department_id()
     ) THEN
    RAISE EXCEPTION 'You can only update claims in your department';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claims_department_write_scope ON public.claims;
CREATE TRIGGER claims_department_write_scope
BEFORE UPDATE ON public.claims
FOR EACH ROW EXECUTE FUNCTION public.assert_claim_department_write_scope();

CREATE OR REPLACE FUNCTION public.assert_expense_department_write_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE claim_department uuid;
BEGIN
  IF public.app_current_role() IN ('Admin', 'Super Admin') THEN
    SELECT c.department_id INTO claim_department
    FROM public.claims c
    WHERE c.claim_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.claim_id ELSE NEW.claim_id END;
    IF public.app_current_department_id() IS NULL
       OR claim_department IS DISTINCT FROM public.app_current_department_id() THEN
      RAISE EXCEPTION 'You can only update claim expenses in your department';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expense_items_department_write_scope ON public.expense_items;
CREATE TRIGGER expense_items_department_write_scope
BEFORE UPDATE OR DELETE ON public.expense_items
FOR EACH ROW EXECUTE FUNCTION public.assert_expense_department_write_scope();

CREATE OR REPLACE FUNCTION public.assert_admin_verifier_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE verifier_department uuid; verifier_role text;
BEGIN
  IF NEW.admin_email IS DISTINCT FROM OLD.admin_email AND NEW.admin_email IS NOT NULL THEN
    SELECT department_id, role INTO verifier_department, verifier_role
    FROM public.users
    WHERE lower(email) = lower(NEW.admin_email) AND active;
    IF verifier_role = 'Master Admin' THEN
      RETURN NEW;
    END IF;
    IF verifier_role = 'Admin'
       AND verifier_department IS NOT DISTINCT FROM NEW.department_id THEN
      RETURN NEW;
    END IF;
    IF verifier_role = 'Super Admin'
       AND verifier_department IS NOT DISTINCT FROM NEW.department_id THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Admin verification must be completed by an Admin or HOD in this claim department';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
