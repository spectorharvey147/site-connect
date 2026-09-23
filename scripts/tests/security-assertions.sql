\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('siteconnect.auth_write','true',true);
INSERT INTO users(email,password_hash,name,role,manager_email) VALUES
 ('release-user@example.invalid',encode(extensions.digest('Testing123!','sha256'),'hex'),'Test User','User','release-manager@example.invalid'),
 ('release-other@example.invalid',encode(extensions.digest('Testing123!','sha256'),'hex'),'Other User','User',NULL),
 ('release-manager@example.invalid',encode(extensions.digest('Testing123!','sha256'),'hex'),'Manager','Manager',NULL),
 ('release-accounts@example.invalid',encode(extensions.digest('Testing123!','sha256'),'hex'),'Accounts','Accounts',NULL),
 ('release-admin@example.invalid',encode(extensions.digest('Testing123!','sha256'),'hex'),'Admin','Super Admin',NULL);
INSERT INTO sap_locations(code,name,costing_code) VALUES('3','Chennai','Chennai');
SELECT set_config('siteconnect.auth_write','false',true);
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;
SET LOCAL ROLE anon;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM claims),'anonymous claims hidden');
DO $$ BEGIN PERFORM password_hash FROM users; RAISE EXCEPTION 'FAIL: readable passwords'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN PERFORM token FROM sessions; RAISE EXCEPTION 'FAIL: readable tokens'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT pg_temp.assert_true(NOT (app_login('release-user@example.invalid','wrong')->>'ok')::boolean,'wrong password rejected');
SELECT app_login('release-user@example.invalid','Testing123!')->'session'->>'token' AS user_token \gset
SELECT set_config('siteconnect.auth_write','false',true);
SELECT set_config('request.headers',jsonb_build_object('x-claims-token',:'user_token')::text,true);
SELECT pg_temp.assert_true(app_current_email()='release-user@example.invalid','login resolves identity');
DO $$ BEGIN UPDATE users SET role='Super Admin' WHERE email=app_current_email(); RAISE EXCEPTION 'FAIL: role escalation'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL: role escalation' THEN RAISE; END IF; END $$;
SELECT submit_claim_secure('{"claim_id":"C-123456789","site_name":"Test Project","drive_file_ids":[]}', '[{"category":"Travel","amount_with_bill":100.25,"amount_without_bill":10,"expense_date":"2026-09-23","attachment_ids":[]}]') AS first_number \gset
SELECT pg_temp.assert_true((SELECT grand_total=110.25 FROM claims WHERE claim_id='C-123456789'),'submitted total computed by server');
SELECT pg_temp.assert_true((SELECT debit=110.25 AND balance_after=-110.25 FROM transactions WHERE reference_id='C-123456789'),'ledger committed');
DO $$ BEGIN PERFORM submit_claim_secure('{"claim_id":"C-123456788","site_name":"Test","drive_file_ids":[]}', '[{"category":"Travel","amount_with_bill":10,"amount_without_bill":0,"expense_date":"invalid-date"}]'); RAISE EXCEPTION 'FAIL: invalid claim committed'; EXCEPTION WHEN invalid_datetime_format THEN NULL; END $$;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM claims WHERE claim_id='C-123456788'),'failed submission rolled back');
SELECT app_login('release-other@example.invalid','Testing123!')->'session'->>'token' AS other_token \gset
SELECT set_config('request.headers',jsonb_build_object('x-claims-token',:'other_token')::text,true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM claims),'other users claims hidden');
SELECT submit_claim_secure('{"claim_id":"C-123456790","site_name":"Test Project","drive_file_ids":[]}', '[{"category":"Travel","amount_with_bill":25,"amount_without_bill":0,"attachment_ids":[]}]') AS second_number \gset
SELECT pg_temp.assert_true(:'first_number'<>:'second_number','claim numbers unique across users');
SELECT app_login('release-manager@example.invalid','Testing123!')->'session'->>'token' AS manager_token \gset
SELECT set_config('request.headers',jsonb_build_object('x-claims-token',:'manager_token')::text,true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM claims),'manager sees assigned claim only');
SELECT app_login('release-admin@example.invalid','Testing123!')->'session'->>'token' AS admin_token \gset
SELECT set_config('siteconnect.auth_write','false',true);
SELECT set_config('request.headers',jsonb_build_object('x-claims-token',:'admin_token')::text,true);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM claims),'finance sees both claims');
DO $$ BEGIN UPDATE expense_items SET approved_amount=111 WHERE claim_id='C-123456789'; RAISE EXCEPTION 'FAIL: above submitted approved'; EXCEPTION WHEN check_violation THEN NULL; END $$;
SELECT pg_temp.assert_true(assign_payment_voucher_code('C-123456789') IS NOT NULL,'finance voucher allocation');
SELECT jsonb_object_agg(id::text,100) AS amounts FROM expense_items WHERE claim_id='C-123456789' \gset
SELECT approve_claim_expense_rows(:'admin_token','C-123456789','admin','Submitted',:'amounts',100);
SELECT set_config('request.headers',jsonb_build_object('x-claims-token',:'manager_token')::text,true);
SELECT approve_claim_expense_rows(:'manager_token','C-123456789','manager','Admin Verified',:'amounts',100);
SELECT set_config('request.headers',jsonb_build_object('x-claims-token',:'admin_token')::text,true);
SELECT approve_claim_expense_rows(:'admin_token','C-123456789','super-admin','Manager Approved',:'amounts',100);
SELECT app_login('release-accounts@example.invalid','Testing123!')->'session'->>'token' AS accounts_token \gset
SELECT set_config('siteconnect.auth_write','false',true);
SELECT set_config('request.headers',jsonb_build_object('x-claims-token',:'accounts_token')::text,true);
SELECT save_accounting_master(:'accounts_token','user','release-user@example.invalid','{"sap_gl_code":"001234","sap_location_code":"3"}');
SELECT approve_claim_expense_rows(:'accounts_token','C-123456789','accounts','Accounts Verification',:'amounts',100);
SELECT pg_temp.assert_true((SELECT verified_amount=100 AND grand_total=110.25 AND status='Accounts Verified' FROM claims WHERE claim_id='C-123456789'),'four approval stages retain submitted and final approved amounts');
SELECT commit_sap_journal_export(:'accounts_token','SAP-20260923-001','{"version":1,"headers":[[],[],[100000,"20260923","Customer","C-123456789","C-123456789/001","Test work","IPI","Test Project","20260923"," ","20260923","3","Test",""]],"details":[[],[],[100000,1,"","4330900007","100.00","","Chennai"],[100000,5,"","001234","","100.00","Chennai"]],"claims":[{"claimId":"C-123456789","amount":100}],"journalClaims":["C-123456789"]}');
SELECT pg_temp.assert_true((SELECT status='Payment Processing' AND sap_exported FROM claims WHERE claim_id='C-123456789'),'SAP export completes after secure approvals');
SELECT set_config('request.headers',jsonb_build_object('x-claims-token',:'user_token')::text,true);
SELECT app_change_password(:'user_token','Testing123!','Changed123!');
SELECT app_logout(:'user_token');
SELECT pg_temp.assert_true(app_session(:'user_token') IS NULL,'logout invalidates token');
SELECT pg_temp.assert_true(NOT (app_login('release-user@example.invalid','Testing123!')->>'ok')::boolean,'old password rejected');
RESET ROLE;
SELECT app_issue_password_reset('release-user@example.invalid') AS reset_token \gset
SET LOCAL ROLE anon;
SELECT app_reset_password('release-user@example.invalid',:'reset_token','Reset123!');
SELECT pg_temp.assert_true((app_login('release-user@example.invalid','Reset123!')->>'ok')::boolean,'reset password works');
DO $$ BEGIN PERFORM app_issue_password_reset('release-user@example.invalid'); RAISE EXCEPTION 'FAIL: user could issue reset'; EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
ROLLBACK;
\echo 'PASS: authentication, permissions, atomic claims, numbering, approval ceiling, and password reset'
