import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
export default function AttachmentAccessView() {
  const [params] = useSearchParams();
  const bucket = params.get('bucket') || 'claim-attachments', path = params.get('path') || '';
  const [url,setUrl] = useState(''), [error,setError] = useState('');
  useEffect(() => {
    let cancelled=false; setUrl(''); setError('');
    if (!['claim-attachments','claim-receipts','sap-exports'].includes(bucket) || !path) { setError('Invalid attachment link'); return; }
    supabase.storage.from(bucket).createSignedUrl(path,3600).then(({data,error}: {data?:{signedUrl:string};error?:{message:string}}) => {
      if(cancelled) return;
      if(error) setError(error.message); else setUrl(data?.signedUrl || '');
    }).catch(() => { if(!cancelled) setError('Unable to load the file'); });
    return () => { cancelled=true; };
  },[bucket,path]);
  return <section className="space-y-4 rounded-lg border p-5"><h1 className="font-semibold">{path.split('/').pop() || 'Attachment'}</h1>{error ? <p role="alert">{error}</p> : url ? <a className="text-primary underline" href={url} target="_blank" rel="noopener noreferrer">Open or download file</a> : <p>Checking access…</p>}</section>;
}
