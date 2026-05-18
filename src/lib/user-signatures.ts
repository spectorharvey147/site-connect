const USER_SIGNATURES_KEY = 'claimsUserSignatures';

function normalizeEmail(email?: string | null) {
  return String(email || '').trim().toLowerCase();
}

function readSignatureMap(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(USER_SIGNATURES_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function getStoredUserSignature(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return '';
  return readSignatureMap()[normalized] || '';
}

export function setStoredUserSignature(email: string, url: string) {
  if (typeof localStorage === 'undefined') return;
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const signatures = readSignatureMap();
  if (url) signatures[normalized] = url;
  else delete signatures[normalized];
  localStorage.setItem(USER_SIGNATURES_KEY, JSON.stringify(signatures));
}
