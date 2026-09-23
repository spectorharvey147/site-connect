\set ON_ERROR_STOP on
-- The older deployed app must continue working during localhost testing.
INSERT INTO claims(claim_id,site_name) VALUES ('LEGACY','Existing project');
INSERT INTO sap_export_batches(batch_id,total_amount) VALUES ('LEGACY-EXCEL',0);
DELETE FROM sap_export_batches WHERE batch_id='LEGACY-EXCEL';
UPDATE company_settings SET require_work_allocation=true;
INSERT INTO users(email,name,role) VALUES ('admin@test','Admin','Admin'),('accounts@test','Accounts','Accounts'),('one@test','One','Manager'),('two@test','Two','Manager'),('three@test','Three','Manager'),('employee@test','Employee','User');
INSERT INTO sessions VALUES ('admin-token','admin@test',now()+interval '1 hour'),('accounts-token','accounts@test',now()+interval '1 hour'),('user-token','employee@test',now()+interval '1 hour');
INSERT INTO sessions VALUES ('one-token','one@test',now()+interval '1 hour'),('two-token','two@test',now()+interval '1 hour');
INSERT INTO app_lists(id,type,value) VALUES ('00000000-0000-0000-0000-000000000001','project','AMC');
SELECT save_accounting_master('admin-token','project_manager','00000000-0000-0000-0000-000000000001','{"manager_email":"one@test"}');
SELECT save_accounting_master('admin-token','work','00000000-0000-0000-0000-000000000002','{"project_id":"00000000-0000-0000-0000-000000000001","name":"Installation","manager_email":"two@test"}');
SELECT save_accounting_master('admin-token','work','00000000-0000-0000-0000-000000000003','{"project_id":"00000000-0000-0000-0000-000000000001","name":"Maintenance","manager_email":"three@test"}');
SELECT save_accounting_master('accounts-token','user','employee@test','{"sap_gl_code":"00123","sap_location_code":"3"}');
DO $$ BEGIN
 IF (SELECT count(*) FROM project_works)<>3 THEN RAISE EXCEPTION 'Expected three work allocations'; END IF;
 IF (SELECT gl_code FROM sap_expense_groups WHERE code='travel')<>'4330900007' THEN RAISE EXCEPTION 'Wrong travel GL'; END IF;
 IF (SELECT sap_gl_code FROM users WHERE email='employee@test')<>'00123' THEN RAISE EXCEPTION 'GL leading zeros lost'; END IF;
 BEGIN
   PERFORM save_accounting_master('accounts-token','project_manager','00000000-0000-0000-0000-000000000001','{"manager_email":"two@test"}');
   RAISE EXCEPTION 'Accounts changed work allocation';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Accounts changed work allocation' THEN RAISE; END IF; END;
 BEGIN
   PERFORM save_accounting_master('user-token','user','employee@test','{"sap_gl_code":"9"}');
   RAISE EXCEPTION 'Employee changed GL';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Employee changed GL' THEN RAISE; END IF; END;
END $$;

INSERT INTO claims(claim_id,site_name,work_id,total_with_bill,status) SELECT 'C1','AMC',id,200,'Accounts Verification' FROM project_works WHERE name='General work';
INSERT INTO claims(claim_id,site_name,work_id,total_with_bill) VALUES ('C2','AMC','00000000-0000-0000-0000-000000000002',100),('C3','AMC','00000000-0000-0000-0000-000000000003',100);
DO $$ BEGIN
 IF (SELECT manager_email FROM claims WHERE claim_id='C1')<>'one@test' OR (SELECT manager_email FROM claims WHERE claim_id='C2')<>'two@test' OR (SELECT manager_email FROM claims WHERE claim_id='C3')<>'three@test' THEN RAISE EXCEPTION 'Work routing failed'; END IF;
 IF (SELECT status FROM claims WHERE claim_id='C1')<>'Submitted' THEN RAISE EXCEPTION 'Auto-approval bypassed work'; END IF;
 BEGIN INSERT INTO claims(claim_id,site_name) VALUES ('BAD','AMC'); RAISE EXCEPTION 'Missing work allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Missing work allowed' THEN RAISE; END IF; END;
 BEGIN UPDATE claims SET status='Manager Approved' WHERE claim_id='C1'; RAISE EXCEPTION 'Manager stage bypassed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Manager stage bypassed' THEN RAISE; END IF; END;
END $$;
SELECT save_accounting_master('admin-token','project_manager','00000000-0000-0000-0000-000000000001','{"manager_email":"three@test"}');
DO $$ BEGIN IF (SELECT manager_email FROM claims WHERE claim_id='C1')<>'one@test' THEN RAISE EXCEPTION 'Existing manager changed'; END IF; END $$;
UPDATE claims SET status='Admin Verified',manager_approval_status='Pending' WHERE claim_id='C1';
DO $$ BEGIN
 BEGIN PERFORM act_on_work_claim('two-token','C1',true,200); RAISE EXCEPTION 'Wrong manager approved';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Wrong manager approved' THEN RAISE; END IF; END;
 BEGIN UPDATE claims SET status='Manager Approved' WHERE claim_id='C1'; RAISE EXCEPTION 'Direct manager bypass accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Direct manager bypass accepted' THEN RAISE; END IF; END;
END $$;
SELECT act_on_work_claim('one-token','C1',true,200);
UPDATE claims SET status='Accounts Verified' WHERE claim_id='C1';

CREATE TEMP TABLE test_payload(payload jsonb);
INSERT INTO test_payload VALUES ('{"version":1,"headers":[[],[],[1,"20260920","Customer","C1","C1/001","General work","IPI","8020-Service","20260919"," ","20260920","2","General work Customer",""]],"details":[[],[],[1,1,1,"4330900007","200.00","","Bangalor"],[1,5,5,"00123","","200.00","Bangalor"]],"claims":[{"claimId":"C1","amount":200}],"journalClaims":["C1"]}');
DO $$ BEGIN
 BEGIN PERFORM commit_sap_journal_export('accounts-token','BAD-BATCH',(SELECT jsonb_set(payload,'{details,2,4}','"199.00"') FROM test_payload)); RAISE EXCEPTION 'Unbalanced export accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Unbalanced export accepted' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM sap_export_batches WHERE batch_id='BAD-BATCH') OR (SELECT sap_exported FROM claims WHERE claim_id='C1') THEN RAISE EXCEPTION 'Failed export changed state'; END IF;
END $$;
SELECT commit_sap_journal_export('accounts-token','TEST-BATCH',payload) FROM test_payload;
DO $$ BEGIN
 IF (SELECT status FROM claims WHERE claim_id='C1')<>'Payment Processing' THEN RAISE EXCEPTION 'Export did not advance status'; END IF;
 IF (SELECT export_payload FROM sap_export_batches WHERE batch_id='TEST-BATCH') IS DISTINCT FROM (SELECT payload FROM test_payload) THEN RAISE EXCEPTION 'Snapshot was not saved'; END IF;
 BEGIN PERFORM commit_sap_journal_export('accounts-token','DUPLICATE',(SELECT payload FROM test_payload)); RAISE EXCEPTION 'Duplicate export accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Duplicate export accepted' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM sap_export_batches)<>1 OR (SELECT count(*) FROM sap_export_batch_items)<>1 THEN RAISE EXCEPTION 'Duplicate export left records'; END IF;
END $$;
SELECT save_accounting_master('accounts-token','user','employee@test','{"sap_gl_code":"00999","sap_location_code":"6"}');
DO $$ BEGIN
 IF (SELECT export_payload->'details'->3->>3 FROM sap_export_batches WHERE batch_id='TEST-BATCH')<>'00123' THEN RAISE EXCEPTION 'Master edit changed saved export'; END IF;
END $$;
-- The read-only application role can read allocation options, but direct writes
-- to new masters and export batches are denied even outside the UI.
SET ROLE anon;
SELECT count(*) AS readable_work_options FROM project_works;
DO $$ BEGIN
 BEGIN UPDATE project_works SET name='Tampered'; RAISE EXCEPTION 'Direct work write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE sap_export_batches SET total_amount=1; RAISE EXCEPTION 'Direct export write allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Direct export write allowed' THEN RAISE; END IF; END;
 BEGIN DELETE FROM sap_export_batch_items; RAISE EXCEPTION 'Direct membership write allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Direct membership write allowed' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT 'Work routing, permissions, balancing, atomic export and duplicate checks passed' AS result;
