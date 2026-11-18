BEGIN;

-- Vercel's production rewrite forwards requests to Supabase from Vercel's
-- outbound IP. Vercel overwrites X-Forwarded-For with the visitor IP; only
-- trust it when the forwarded host is this application's production domain.
CREATE OR REPLACE FUNCTION public.request_client_ip(p_headers jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  candidate text;
BEGIN
  IF lower(btrim(coalesce(p_headers->>'x-forwarded-host', ''))) = 'site-connect-three.vercel.app' THEN
    candidate := btrim(split_part(coalesce(p_headers->>'x-forwarded-for', ''), ',', 1));
    IF candidate ~ '^[0-9A-Fa-f:.]+$' AND length(candidate) <= 64 THEN
      BEGIN
        RETURN pg_catalog.host(candidate::pg_catalog.inet);
      EXCEPTION WHEN invalid_text_representation THEN
        NULL;
      END;
    END IF;
  END IF;

  candidate := coalesce(
    nullif(btrim(p_headers->>'cf-connecting-ip'), ''),
    nullif(btrim(p_headers->>'x-real-ip'), '')
  );
  IF candidate ~ '^[0-9A-Fa-f:.]+$' AND length(candidate) <= 64 THEN
    BEGIN
      RETURN pg_catalog.host(candidate::pg_catalog.inet);
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN NULL;
    END;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.request_client_ip(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_claim_submission_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  headers jsonb;
  user_agent text;
  safe_ip text;
  browser text;
  os_name text;
  device text;
BEGIN
  headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  user_agent := left(nullif(headers->>'user-agent', ''), 1000);
  safe_ip := public.request_client_ip(headers);

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

CREATE OR REPLACE FUNCTION public.capture_claim_approval_ip(p_token text, p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  session_info jsonb;
  actor text;
  headers jsonb;
  safe_ip text;
  user_agent text;
BEGIN
  IF p_event_id IS NULL OR p_token IS NULL OR length(p_token) > 256 THEN
    RAISE EXCEPTION 'Invalid approval identity request';
  END IF;

  session_info := public.app_session(p_token);
  actor := lower(trim(coalesce(session_info->>'email', '')));
  IF actor = '' THEN RAISE EXCEPTION 'Your session has expired'; END IF;

  headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  safe_ip := public.request_client_ip(headers);
  IF safe_ip IS NULL THEN RETURN false; END IF;

  user_agent := left(nullif(headers->>'user-agent', ''), 1000);
  DELETE FROM public.claim_approval_ip_attestations WHERE expires_at <= now();
  IF (SELECT count(*) FROM public.claim_approval_ip_attestations
      WHERE actor_email = actor AND created_at > now() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'Too many approval identity requests. Try again shortly';
  END IF;

  INSERT INTO public.claim_approval_ip_attestations(event_id, actor_email, ip_address, user_agent)
  VALUES(p_event_id, actor, safe_ip, user_agent)
  ON CONFLICT(event_id) DO NOTHING;

  RETURN EXISTS (
    SELECT 1 FROM public.claim_approval_ip_attestations
    WHERE event_id = p_event_id AND actor_email = actor AND expires_at > now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.capture_claim_approval_ip(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_claim_approval_ip(text, uuid) TO anon, authenticated;

COMMIT;
