BEGIN;

-- The Edge Function and its caller successfully exchanged the IP attestation,
-- but the approval-event trigger still stored NULL. Resolve the short-lived
-- server-captured address at the final event insert boundary as a fallback.
CREATE OR REPLACE FUNCTION public.apply_approval_event_ip_attestation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attested_ip text;
BEGIN
  IF NULLIF(NEW.ip_address, '') IS NOT NULL OR NEW.idempotency_key IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT attestation.ip_address INTO attested_ip
  FROM public.claim_approval_ip_attestations AS attestation
  WHERE attestation.event_id = NEW.idempotency_key
    AND lower(attestation.actor_email) = lower(NEW.actor_email)
    AND attestation.expires_at > now()
  LIMIT 1;

  IF attested_ip IS NOT NULL THEN
    NEW.ip_address := attested_ip;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_approval_event_ip_attestation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS apply_approval_event_ip_attestation ON public.claim_approval_events;
CREATE TRIGGER apply_approval_event_ip_attestation
BEFORE INSERT ON public.claim_approval_events
FOR EACH ROW
EXECUTE FUNCTION public.apply_approval_event_ip_attestation();

COMMIT;
