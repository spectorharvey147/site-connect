BEGIN;

CREATE OR REPLACE FUNCTION public.admin_correct_pending_claim_expense_category(
  p_token TEXT,
  p_claim_id TEXT,
  p_expense_id UUID,
  p_category TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor TEXT; actor_role TEXT; c RECORD; old_category TEXT; selected_category TEXT;
BEGIN
 SELECT u.email,u.role INTO actor,actor_role
 FROM public.sessions s JOIN public.users u ON lower(u.email)=lower(s.user_email)
 WHERE s.token=p_token AND s.expires_at>now() AND u.active;
 IF actor IS NULL OR actor_role NOT IN ('Admin','Super Admin') THEN
   RAISE EXCEPTION 'Only Admin or Super Admin can correct expense categories during verification';
 END IF;

 SELECT claim_id,status INTO c FROM public.claims WHERE claim_id=p_claim_id FOR UPDATE;
 IF NOT FOUND OR c.status NOT IN ('Submitted','Pending Admin Verification') THEN
   RAISE EXCEPTION 'Expense categories can only be corrected while the claim is pending Admin verification';
 END IF;
 SELECT value INTO selected_category FROM public.app_lists
 WHERE lower(type)='category' AND active AND value=trim(p_category);
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active expense category'; END IF;
 SELECT category INTO old_category FROM public.expense_items
 WHERE id=p_expense_id AND claim_id=p_claim_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expense row does not belong to this claim'; END IF;
 IF old_category IS DISTINCT FROM selected_category THEN
   UPDATE public.expense_items SET category=selected_category WHERE id=p_expense_id;
   INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
   VALUES('claim_expense_category_corrected',actor,'claim',p_claim_id,jsonb_build_object(
     'expense_id',p_expense_id,'previous_category',old_category,'category',selected_category
   )::text);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_detach_pending_claim_attachment(
  p_token TEXT,
  p_claim_id TEXT,
  p_path TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor TEXT; actor_role TEXT; c RECORD; was_referenced BOOLEAN; can_delete_object BOOLEAN;
BEGIN
 SELECT u.email,u.role INTO actor,actor_role
 FROM public.sessions s JOIN public.users u ON lower(u.email)=lower(s.user_email)
 WHERE s.token=p_token AND s.expires_at>now() AND u.active;
 IF actor IS NULL OR actor_role NOT IN ('Admin','Super Admin') THEN
   RAISE EXCEPTION 'Only Admin or Super Admin can remove claim attachments during verification';
 END IF;
 IF p_path IS NULL OR trim(p_path)='' OR p_path LIKE '%..%' OR position(chr(92) IN p_path)>0 OR p_path LIKE '%://%' THEN
   RAISE EXCEPTION 'Invalid attachment path';
 END IF;

 SELECT claim_id,claim_number,status,coalesce(drive_file_ids,'{}'::text[]) drive_file_ids
 INTO c FROM public.claims WHERE claim_id=p_claim_id FOR UPDATE;
 IF NOT FOUND OR c.status NOT IN ('Submitted','Pending Admin Verification') THEN
   RAISE EXCEPTION 'Attachments can only be removed while the claim is pending Admin verification';
 END IF;

 was_referenced := p_path=ANY(c.drive_file_ids) OR EXISTS(
   SELECT 1 FROM public.expense_items e WHERE e.claim_id=p_claim_id AND p_path=ANY(coalesce(e.attachment_ids,'{}'::text[]))
 );
 IF NOT was_referenced AND split_part(p_path,'/',1) NOT IN (p_claim_id,coalesce(c.claim_number,'')) THEN
   RAISE EXCEPTION 'Attachment does not belong to this claim';
 END IF;

 UPDATE public.claims SET drive_file_ids=array_remove(coalesce(drive_file_ids,'{}'::text[]),p_path)
 WHERE claim_id=p_claim_id;
 UPDATE public.expense_items SET attachment_ids=array_remove(coalesce(attachment_ids,'{}'::text[]),p_path)
 WHERE claim_id=p_claim_id AND p_path=ANY(coalesce(attachment_ids,'{}'::text[]));

 SELECT split_part(p_path,'/',1) IN (p_claim_id,coalesce(c.claim_number,'')) AND NOT EXISTS(
   SELECT 1 FROM public.claims other WHERE other.claim_id<>p_claim_id AND p_path=ANY(coalesce(other.drive_file_ids,'{}'::text[]))
   UNION ALL
   SELECT 1 FROM public.expense_items other WHERE other.claim_id<>p_claim_id AND p_path=ANY(coalesce(other.attachment_ids,'{}'::text[]))
 ) INTO can_delete_object;

 INSERT INTO public.audit_logs(action,performed_by,target_type,target_id,details)
 VALUES('claim_attachment_removed',actor,'claim',p_claim_id,jsonb_build_object(
   'path',p_path,'was_referenced',was_referenced,'storage_delete_allowed',can_delete_object
 )::text);
 RETURN can_delete_object;
END $$;

REVOKE ALL ON FUNCTION public.admin_correct_pending_claim_expense_category(TEXT,TEXT,UUID,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_correct_pending_claim_expense_category(TEXT,TEXT,UUID,TEXT) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_detach_pending_claim_attachment(TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_detach_pending_claim_attachment(TEXT,TEXT,TEXT) TO anon,authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
