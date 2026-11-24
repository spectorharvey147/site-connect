CREATE INDEX IF NOT EXISTS idx_app_lists_sap_expense_group
  ON public.app_lists (sap_expense_group);

CREATE INDEX IF NOT EXISTS idx_app_lists_sap_location_code
  ON public.app_lists (sap_location_code);

CREATE INDEX IF NOT EXISTS idx_claims_work_id
  ON public.claims (work_id);

CREATE INDEX IF NOT EXISTS idx_sap_export_batch_items_claim_id
  ON public.sap_export_batch_items (claim_id);

CREATE INDEX IF NOT EXISTS idx_users_sap_location_code
  ON public.users (sap_location_code);
