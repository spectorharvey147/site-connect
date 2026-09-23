import { supabase } from '@/integrations/supabase/client';
import { attachmentLink } from './private-files';
export { supabase };
export function getReceiptUrl(path: string) { return attachmentLink(path, 'claim-receipts'); }
