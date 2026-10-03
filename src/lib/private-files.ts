export function attachmentLink(path: string, bucket = 'claim-attachments', baseUrl?: string) {
  const origin = baseUrl || window.location.origin;
  const url = new URL('/attachment', origin);
  url.searchParams.set('bucket', bucket);
  url.searchParams.set('path', path);
  return url.href;
}
