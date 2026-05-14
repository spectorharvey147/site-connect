import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase configuration. Check VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function getReceiptUrl(path: string) {
  const { data } = supabase.storage.from("claim-receipts").getPublicUrl(path);
  return data.publicUrl;
}
