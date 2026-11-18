BEGIN;

-- inet text output includes a /32 or /128 host mask. Store only the address
-- for all new event rows, including submission and approval events.
CREATE OR REPLACE FUNCTION public.normalize_claim_approval_event_ip()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.ip_address IS NULL OR btrim(NEW.ip_address) = '' THEN
    NEW.ip_address := NULL;
    RETURN NEW;
  END IF;

  BEGIN
    NEW.ip_address := pg_catalog.host(NEW.ip_address::pg_catalog.inet);
  EXCEPTION WHEN invalid_text_representation THEN
    NEW.ip_address := NULL;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_claim_approval_event_ip() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS normalize_claim_approval_event_ip ON public.claim_approval_events;
CREATE TRIGGER normalize_claim_approval_event_ip
BEFORE INSERT ON public.claim_approval_events
FOR EACH ROW
EXECUTE FUNCTION public.normalize_claim_approval_event_ip();

COMMIT;
