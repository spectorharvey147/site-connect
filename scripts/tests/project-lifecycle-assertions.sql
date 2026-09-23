\set ON_ERROR_STOP on
BEGIN;
INSERT INTO app_lists(type,value,project_code,active) VALUES ('project','Lifecycle test','LIFE',true),('category','Lifecycle travel',NULL,true);
INSERT INTO app_lists(type,value,project_code,project,active) VALUES ('projectcode','Running code','LIFE-A','Lifecycle test',true),('projectcode','Manually stopped','LIFE-B','Lifecycle test',false);
UPDATE app_lists SET active=false WHERE type='project' AND value='Lifecycle test';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM app_lists WHERE project='Lifecycle test' AND active) THEN RAISE EXCEPTION 'Child cost code remained active'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_lists WHERE project_code='LIFE-A' AND inactive_by_project) THEN RAISE EXCEPTION 'Cascade not recorded'; END IF;
 IF EXISTS(SELECT 1 FROM app_lists WHERE project_code='LIFE-B' AND inactive_by_project) THEN RAISE EXCEPTION 'Manual inactive status overwritten'; END IF;
END $$;
INSERT INTO app_lists(type,value,project_code,project,active) VALUES ('projectcode','New during closure','LIFE-C','Lifecycle test',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM app_lists WHERE project_code='LIFE-C' AND active) THEN RAISE EXCEPTION 'New code bypassed inactive project'; END IF; END $$;
UPDATE app_lists SET active=true WHERE type='projectcode' AND project_code='LIFE-A';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM app_lists WHERE project_code='LIFE-A' AND active) THEN RAISE EXCEPTION 'Direct child reactivation bypassed parent'; END IF; END $$;
UPDATE app_lists SET active=true WHERE type='project' AND value='Lifecycle test';
DO $$ BEGIN
 IF (SELECT count(*) FROM app_lists WHERE project='Lifecycle test' AND active)<>2 THEN RAISE EXCEPTION 'Reactivation did not restore only cascaded codes'; END IF;
 IF EXISTS(SELECT 1 FROM app_lists WHERE project_code='LIFE-B' AND active) THEN RAISE EXCEPTION 'Manually inactive code incorrectly reactivated'; END IF;
END $$;
INSERT INTO claims(claim_id,user_email,submitted_by,site_name,status,total_with_bill,total_without_bill) VALUES('C-LIFECYCLE','test@example.invalid','Test','Lifecycle test','Submitted',100,0);
INSERT INTO expense_items(claim_id,category,project_code,amount_with_bill,amount_without_bill) VALUES('C-LIFECYCLE','Lifecycle travel','LIFE-A',100,0);
UPDATE app_lists SET active=false WHERE type='project' AND value='Lifecycle test';
DO $$ BEGIN
 BEGIN
  INSERT INTO expense_items(claim_id,category,project_code,amount_with_bill,amount_without_bill) VALUES('C-LIFECYCLE','Lifecycle travel','LIFE-A',100,0);
  RAISE EXCEPTION 'FAIL stale submission accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL stale submission accepted' THEN RAISE; END IF; END;
 IF (SELECT sum(amount_with_bill) FROM expense_items WHERE claim_id='C-LIFECYCLE')<>100 THEN RAISE EXCEPTION 'Historical expense changed'; END IF;
END $$;
ROLLBACK;
\echo 'PASS project cascade, selective reactivation, new-code guard, stale submission and retained history'
