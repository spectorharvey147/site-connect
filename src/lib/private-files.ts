export function attachmentLink(path: string, bucket = 'claim-attachments') {
  const url = new URL('/attachment', window.location.origin);
  url.searchParams.set('bucket', bucket);
  url.searchParams.set('path', path);
  return url.href;
}
