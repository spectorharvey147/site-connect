const env = (import.meta as any).env || {};

/** Route browser image requests through the app's same-origin Supabase proxy. */
export function proxySupabaseStorageUrl(source?: string | null) {
  if (!source || !env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PROXY_URL) return source || '';

  try {
    const imageUrl = new URL(source, window.location.origin);
    const supabaseOrigin = new URL(env.VITE_SUPABASE_URL).origin;
    if (imageUrl.origin !== supabaseOrigin || !imageUrl.pathname.startsWith('/storage/v1/')) return source;

    const proxyUrl = new URL(env.VITE_SUPABASE_PROXY_URL, window.location.origin);
    const proxyPath = proxyUrl.pathname.replace(/\/$/, '');
    return `${proxyUrl.origin}${proxyPath}${imageUrl.pathname}${imageUrl.search}${imageUrl.hash}`;
  } catch {
    return source;
  }
}
