BEGIN;

CREATE OR REPLACE FUNCTION public.capture_claim_submission_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  headers jsonb;
  user_agent text;
  client_ip text;
  safe_ip text;
  browser text;
  os_name text;
  device text;
BEGIN
  headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  user_agent := left(nullif(headers->>'user-agent', ''), 1000);
  client_ip := coalesce(
    nullif(trim(headers->>'cf-connecting-ip'), ''),
    nullif(trim(headers->>'x-real-ip'), '')
  );

  IF client_ip ~ '^[0-9A-Fa-f:.]+$' AND length(client_ip) <= 64 THEN
    BEGIN
      safe_ip := client_ip::inet::text;
    EXCEPTION WHEN invalid_text_representation THEN
      safe_ip := NULL;
    END;
  END IF;

  browser := CASE
    WHEN user_agent ILIKE '%Edg/%' THEN 'Edge'
    WHEN user_agent ILIKE '%Chrome/%' THEN 'Chrome'
    WHEN user_agent ILIKE '%Firefox/%' THEN 'Firefox'
    WHEN user_agent ILIKE '%Safari/%' THEN 'Safari'
    ELSE NULL
  END;
  os_name := CASE
    WHEN user_agent ILIKE '%Windows%' THEN 'Windows'
    WHEN user_agent ILIKE '%Android%' THEN 'Android'
    WHEN user_agent ILIKE '%iPhone%' OR user_agent ILIKE '%iPad%' THEN 'iOS'
    WHEN user_agent ILIKE '%Mac OS%' THEN 'macOS'
    WHEN user_agent ILIKE '%Linux%' THEN 'Linux'
    ELSE NULL
  END;
  device := CASE
    WHEN user_agent ILIKE '%Mobile%' OR user_agent ILIKE '%Android%' OR user_agent ILIKE '%iPhone%' THEN 'Mobile'
    WHEN user_agent ILIKE '%iPad%' OR user_agent ILIKE '%Tablet%' THEN 'Tablet'
    WHEN user_agent IS NOT NULL THEN 'Desktop'
    ELSE NULL
  END;

  INSERT INTO public.claim_approval_events (
    claim_id, approval_stage, action, actor_email, actor_name, approved_at,
    ip_address, user_agent, browser_name, operating_system, device_type
  ) VALUES (
    NEW.claim_id, 'Submission', 'Submitted', NEW.user_email, NEW.submitted_by,
    coalesce(NEW.created_at, now()), safe_ip, user_agent, browser, os_name, device
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_claim_submission_identity ON public.claims;
CREATE TRIGGER capture_claim_submission_identity
AFTER INSERT ON public.claims
FOR EACH ROW
EXECUTE FUNCTION public.capture_claim_submission_identity();

COMMIT;
