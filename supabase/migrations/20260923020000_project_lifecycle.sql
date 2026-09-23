BEGIN;
ALTER TABLE public.app_lists ADD COLUMN inactive_by_project boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.sync_project_cost_code_status() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE parent_active boolean;
BEGIN
 IF NEW.type='projectcode' AND nullif(trim(NEW.project),'') IS NOT NULL THEN
  SELECT bool_and(active) INTO parent_active FROM app_lists WHERE type='project' AND value=NEW.project;
  IF parent_active IS NULL THEN RAISE EXCEPTION 'Select an existing parent project'; END IF;
  IF NOT parent_active AND NEW.active THEN
   NEW.active:=false; NEW.inactive_by_project:=true;
  ELSIF parent_active THEN
   NEW.inactive_by_project:=false;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_project_cost_code_status BEFORE INSERT OR UPDATE ON public.app_lists
 FOR EACH ROW EXECUTE FUNCTION public.sync_project_cost_code_status();

CREATE FUNCTION public.cascade_project_status() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.type='project' THEN
  IF NEW.value IS DISTINCT FROM OLD.value THEN
   UPDATE app_lists SET project=NEW.value WHERE type='projectcode' AND project=OLD.value;
  END IF;
  IF NOT NEW.active AND (OLD.active OR NEW.value IS DISTINCT FROM OLD.value) THEN
   UPDATE app_lists SET inactive_by_project=(active OR inactive_by_project),active=false WHERE type='projectcode' AND project=NEW.value;
  ELSIF NEW.active AND NOT OLD.active THEN
   UPDATE app_lists SET active=true,inactive_by_project=false WHERE type='projectcode' AND project=NEW.value AND inactive_by_project;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cascade_project_status AFTER UPDATE OF active,value ON public.app_lists
 FOR EACH ROW EXECUTE FUNCTION public.cascade_project_status();
-- Reconcile existing inactive projects without enabling anything.
UPDATE public.app_lists c SET active=false,inactive_by_project=true
 WHERE c.type='projectcode' AND c.active AND EXISTS(SELECT 1 FROM public.app_lists p WHERE p.type='project' AND p.value=c.project AND NOT p.active);

CREATE FUNCTION public.check_new_expense_master_status() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE project_name text; parent_active boolean; claim_status text;
BEGIN
 SELECT site_name,status INTO project_name,claim_status FROM claims WHERE claim_id=NEW.claim_id;
 IF claim_status='Submitted' THEN
  -- Lock against concurrent project closure until submission commits.
  PERFORM 1 FROM app_lists WHERE type='project' AND value=project_name FOR SHARE;
  IF EXISTS(SELECT 1 FROM app_lists WHERE type='project' AND value=project_name AND NOT active) THEN RAISE EXCEPTION 'This project is inactive. Refresh and choose an active project'; END IF;
  IF EXISTS(SELECT 1 FROM app_lists WHERE type='category' AND value=NEW.category AND NOT active)
   AND NOT EXISTS(SELECT 1 FROM app_lists WHERE type='category' AND value=NEW.category AND active) THEN RAISE EXCEPTION 'This expense category is inactive'; END IF;
  PERFORM 1 FROM app_lists WHERE type='projectcode' AND project_code=NEW.project_code AND (project=project_name OR nullif(project,'') IS NULL) FOR SHARE;
  IF EXISTS(SELECT 1 FROM app_lists WHERE type='projectcode' AND project_code=NEW.project_code AND (project=project_name OR nullif(project,'') IS NULL))
   AND NOT EXISTS(SELECT 1 FROM app_lists WHERE type='projectcode' AND project_code=NEW.project_code AND (project=project_name OR nullif(project,'') IS NULL) AND active) THEN RAISE EXCEPTION 'This project cost code is inactive'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER check_new_expense_master_status BEFORE INSERT ON public.expense_items
 FOR EACH ROW EXECUTE FUNCTION public.check_new_expense_master_status();
NOTIFY pgrst,'reload schema';
COMMIT;
