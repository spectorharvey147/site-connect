-- Repair the deployed RPC's admin note length expression if needed; fresh installs already have it.
DO $$
DECLARE
  function_definition TEXT;
  corrected_definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.claim_approval_action(text,text,text,text,jsonb,inet,text,text,uuid)'::regprocedure)
    INTO function_definition;
  corrected_definition := replace(
    function_definition,
    $bad$admin_description=nullif(left(p_payload->>'note',''),'')$bad$,
    $good$admin_description=nullif(left(p_payload->>'note',2000),'')$good$
  );
  IF corrected_definition = function_definition THEN
    IF position($good$admin_description=nullif(left(p_payload->>'note',2000),'')$good$ IN function_definition) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Unexpected claim approval function definition';
  END IF;
  EXECUTE corrected_definition;
END $$;
