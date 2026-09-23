\set ON_ERROR_STOP on
INSERT INTO users(email,name,role) VALUES ('admin@test','Admin','Admin'),('manager@test','Manager','Manager'),('final@test','Final','Super Admin'),('accounts@test','Accounts','Accounts'),('user@test','User','User');
INSERT INTO sessions SELECT role,email,now()+interval '1 hour' FROM users;
INSERT INTO claims(claim_id,manager_email,total_with_bill,total_without_bill) VALUES ('ROWS','manager@test',100,50);
INSERT INTO expense_items VALUES ('00000000-0000-0000-0000-000000000001','ROWS',100,0),('00000000-0000-0000-0000-000000000002','ROWS',0,50);
DO $$
DECLARE amounts jsonb := '{"00000000-0000-0000-0000-000000000001":80,"00000000-0000-0000-0000-000000000002":0}';
BEGIN
 BEGIN
  PERFORM approve_claim_expense_rows('User','ROWS','admin','Submitted',amounts,80);
  RAISE EXCEPTION 'Unauthorized approval accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Unauthorized approval accepted' THEN RAISE; END IF; END;
 BEGIN
  PERFORM approve_claim_expense_rows('Admin','ROWS','admin','Submitted',amounts,100);
  RAISE EXCEPTION 'Mismatched total accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Mismatched total accepted' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM expense_items WHERE approved_amount IS NOT NULL) THEN RAISE EXCEPTION 'Failed approval changed rows'; END IF;
 PERFORM approve_claim_expense_rows('Admin','ROWS','admin','Submitted',amounts,80);
 PERFORM approve_claim_expense_rows('Manager','ROWS','manager','Admin Verified',amounts,80);
 PERFORM approve_claim_expense_rows('Super Admin','ROWS','super-admin','Manager Approved',amounts,80);
 PERFORM approve_claim_expense_rows('Accounts','ROWS','accounts','Accounts Verification',amounts,80);
 IF NOT EXISTS(SELECT 1 FROM claims WHERE claim_id='ROWS' AND status='Accounts Verified' AND verified_amount=80 AND grand_total=150) THEN RAISE EXCEPTION 'Incorrect final status or amounts'; END IF;
 IF (SELECT sum(amount_with_bill+amount_without_bill) FROM expense_items)<>150 THEN RAISE EXCEPTION 'Submitted amounts changed'; END IF;
 BEGIN
  UPDATE claims SET verified_amount=150 WHERE claim_id='ROWS';
  RAISE EXCEPTION 'Legacy client changed total';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Legacy client changed total' THEN RAISE; END IF; END;
END $$;
-- Skip prior random identifiers, and never reuse a reservation.
SELECT set_config('siteconnect.sap_export_batch','HISTORY',false);
INSERT INTO sap_export_batches(batch_id,export_payload) VALUES ('HISTORY','{"headers":[[],[],[100001]]}');
DO $$ DECLARE ids bigint[];
BEGIN
 SELECT array_agg(id) INTO ids FROM reserve_sap_journal_ids('Accounts',3) id;
 IF ids IS DISTINCT FROM ARRAY[100000,100002,100003]::bigint[] THEN RAISE EXCEPTION 'Wrong sequence: %',ids; END IF;
 IF (SELECT id FROM reserve_sap_journal_ids('Accounts',1) id)<>100004 THEN RAISE EXCEPTION 'Reservation was reused'; END IF;
END $$;
