function isValidIp(value: string): boolean {
  const octets = value.split('.');
  if (octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)) return true;
  if (!value.includes(':') || value.includes('%')) return false;
  try {
    return new URL(`http://[${value}]/`).hostname.length > 2;
  } catch { return false; }
}

export function serverObservedClientIp(headers: Headers): string | null {
  // Supabase's hosted gateway provides both headers as the client address.
  // Its request logs show x-real-ip matching cf-connecting-ip on Edge calls.
  // Do not use x-forwarded-for: callers can prepend arbitrary values there.
  for (const header of ['cf-connecting-ip', 'x-real-ip']) {
    const value = headers.get(header)?.trim() || '';
    if (value && value.length <= 64 && !value.includes(',') && isValidIp(value)) return value;
  }
  return null;
}

export function profileSignatureStoragePath(value: string | null, expectedOrigin: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.origin !== new URL(expectedOrigin).origin) return null;
    const marker = '/storage/v1/object/public/user-avatars/';
    if (!url.pathname.includes(marker)) return null;
    const path = decodeURIComponent(url.pathname.slice(url.pathname.indexOf(marker) + marker.length));
    if (!path.startsWith('signatures/') || path.includes('..') || path.includes('\\')) return null;
    return path;
  } catch { return null; }
}
