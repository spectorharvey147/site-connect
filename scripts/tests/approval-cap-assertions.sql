\set ON_ERROR_STOP on
BEGIN;
INSERT INTO claims(claim_id,manager_email,total_with_bill,total_without_bill) VALUES ('CAP','manager@test',100,50);
INSERT INTO expense_items(id,claim_id,amount_with_bill,amount_without_bill) VALUES ('00000000-0000-0000-0000-000000000011','CAP',100,0),('00000000-0000-0000-0000-000000000012','CAP',0,50);
DO $$ BEGIN
 BEGIN
  PERFORM approve_claim_expense_rows('Admin','CAP','admin','Submitted','{"00000000-0000-0000-0000-000000000011":100.01,"00000000-0000-0000-0000-000000000012":0}',100.01);
  RAISE EXCEPTION 'Excess row accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM expense_items WHERE claim_id='CAP' AND approved_amount IS NOT NULL) THEN RAISE EXCEPTION 'Rejected approval changed rows'; END IF;
 BEGIN
  UPDATE claims SET verified_amount=150.01 WHERE claim_id='CAP';
  RAISE EXCEPTION 'Excess total accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Excess total accepted' THEN RAISE; END IF; END;
 PERFORM approve_claim_expense_rows('Admin','CAP','admin','Submitted','{"00000000-0000-0000-0000-000000000011":100,"00000000-0000-0000-0000-000000000012":50}',150);
 IF NOT EXISTS(SELECT 1 FROM claims WHERE claim_id='CAP' AND verified_amount=150 AND status='Admin Verified') THEN RAISE EXCEPTION 'Exact submitted amount rejected'; END IF;
END $$;
ROLLBACK;
