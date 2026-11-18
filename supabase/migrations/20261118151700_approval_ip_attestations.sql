BEGIN;

CREATE TABLE public.claim_approval_ip_attestations (
  event_id uuid PRIMARY KEY,
  actor_email text NOT NULL,
  ip_address text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);
CREATE INDEX claim_approval_ip_attestations_expiry_idx
  ON public.claim_approval_ip_attestations(expires_at);
ALTER TABLE public.claim_approval_ip_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.claim_approval_ip_attestations FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.claim_approval_ip_attestations TO service_role;

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
  client_ip text;
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
  client_ip := coalesce(
    nullif(trim(headers->>'cf-connecting-ip'), ''),
    nullif(trim(headers->>'x-real-ip'), '')
  );
  IF client_ip IS NULL OR client_ip !~ '^[0-9A-Fa-f:.]+$' OR length(client_ip) > 64 THEN RETURN false; END IF;
  BEGIN
    safe_ip := client_ip::inet::text;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

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
