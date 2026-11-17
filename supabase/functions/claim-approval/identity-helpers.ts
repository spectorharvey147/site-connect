function isValidIp(value: string): boolean {
  const octets = value.split('.');
  if (octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)) return true;
  if (!value.includes(':') || value.includes('%')) return false;
  try {
    return new URL(`http://[${value}]/`).hostname.length > 2;
  } catch { return false; }
}

export function serverObservedClientIp(headers: Headers): string | null {
  // Supabase's hosted platform sets cf-connecting-ip. Forwarded headers can
  // contain caller-supplied values, so they are intentionally not fallbacks.
  const value = headers.get('cf-connecting-ip')?.trim() || '';
  if (!value || value.length > 64 || value.includes(',')) return null;
  return isValidIp(value) ? value : null;
}

export function profileSignatureStoragePath(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const marker = '/storage/v1/object/public/user-avatars/';
    if (!url.pathname.includes(marker)) return null;
    const path = decodeURIComponent(url.pathname.slice(url.pathname.indexOf(marker) + marker.length));
    if (!path.startsWith('signatures/') || path.includes('..') || path.includes('\\')) return null;
    return path;
  } catch { return null; }
}
