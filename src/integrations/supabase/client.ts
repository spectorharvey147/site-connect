import { createClient } from "@supabase/supabase-js";

// import.meta.env is provided by Vite; cast to any to avoid TS issues in environments
const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;

let supabase: any;

if (!supabaseUrl || !supabaseKey) {
  // Development-friendly stub: warn and provide no-op client methods so UI can render.
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable backend features. UI will run with a stubbed client."
  );

  const stubResponse = async () => ({ data: null, error: { message: 'Supabase not configured in environment' } });

  const fromFn = (_table: string) => ({
    select: () => stubResponse(),
    insert: () => stubResponse(),
    update: () => stubResponse(),
    delete: () => stubResponse(),
    upsert: () => stubResponse(),
    order: () => ({ select: () => stubResponse() }),
    limit: () => ({ select: () => stubResponse() }),
    range: () => ({ select: () => stubResponse() }),
  });

  const auth = {
    signIn: () => stubResponse(),
    signUp: () => stubResponse(),
    signOut: () => stubResponse(),
    user: () => null,
    getUser: () => ({ data: null }),
  };

  supabase = {
    from: fromFn,
    rpc: () => stubResponse(),
    auth,
    storage: {
      from: () => ({ createBucket: () => stubResponse(), list: () => stubResponse() }),
    },
  };
} else {
  supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      // Fail fast when a network/VPN policy blocks Supabase instead of leaving login spinning.
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        return fetch(input, { ...init, signal: controller.signal }).finally(() => window.clearTimeout(timeout));
      },
    },
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export { supabase };
