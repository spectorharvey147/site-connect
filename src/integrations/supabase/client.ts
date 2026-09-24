import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

// import.meta.env is provided by Vite; cast to any to avoid TS issues in environments
const env = (import.meta as any).env || {};
const supabaseOriginUrl = env.VITE_SUPABASE_URL;
const configuredProxyUrl = env.VITE_SUPABASE_PROXY_URL;
const supabaseUrl = configuredProxyUrl && !Capacitor.isNativePlatform()
  ? new URL(configuredProxyUrl, window.location.origin).toString().replace(/\/$/, '')
  : supabaseOriginUrl;
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
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        const appToken = localStorage.getItem('claimsToken');
        if (appToken) headers.set('x-claims-token', appToken);
        const requestedUrl = input instanceof Request ? input.url : String(input);
        const marker = '/storage/v1';
        if (requestedUrl.startsWith(supabaseUrl + marker)) {
          const destination = supabaseUrl + '/functions/v1/storage-access?path=' + encodeURIComponent(requestedUrl.slice((supabaseUrl + marker).length));
          const body = init?.body ?? (input instanceof Request && !['GET','HEAD'].includes(input.method) ? await input.clone().arrayBuffer() : undefined);
          return fetch(destination, { ...init, method: init?.method || (input instanceof Request ? input.method : 'GET'), body, headers, signal: controller.signal }).finally(() => window.clearTimeout(timeout));
        }
        return fetch(input, { ...init, headers, signal: controller.signal }).finally(() => window.clearTimeout(timeout));
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
