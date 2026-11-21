BEGIN;

-- The vendor account code is the shared accounts payable control GL. The BP
-- short form identifies each vendor and is the value that must be unique.
ALTER TABLE public.sap_vendors
  DROP CONSTRAINT sap_vendors_vendor_account_code_key;

CREATE UNIQUE INDEX sap_vendors_short_form_unique
  ON public.sap_vendors (lower(trim(short_form)));

COMMIT;
