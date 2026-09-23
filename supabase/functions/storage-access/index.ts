import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,x-claims-token,x-upsert,cache-control', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' };
const json = (status: number, message: string) => new Response(JSON.stringify({ message }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const base = Deno.env.get('SUPABASE_URL')!;
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(base, secret);
  try {
    const { data: actor } = await db.rpc('app_session', { p_token: req.headers.get('x-claims-token') || '' });
    if (!actor) return json(401, 'Sign in to access files');
    const route = new URL(req.url).searchParams.get('path') || '';
    if (!route.startsWith('/object/') || route.includes('..') || route.includes('\\') || route.includes('://')) return json(400, 'Invalid storage path');
    const parsed = new URL(base + '/storage/v1' + route);
    const parts = parsed.pathname.slice('/storage/v1/object/'.length).split('/').map(decodeURIComponent);
    if (parts.some(part => part === '..' || part.includes('\\') || part.includes('/'))) return json(400, 'Invalid storage path');
    const operation = ['list','sign','authenticated','public'].includes(parts[0]) ? parts.shift()! : 'object';
    const bucket = parts.shift()!;
    if (!['claim-attachments','claim-receipts','sap-exports','company-assets','user-avatars'].includes(bucket)) return json(403, 'Bucket not allowed');
    const finance = ['Admin','Super Admin','Accounts'].includes(actor.role);
    const admin = ['Admin','Super Admin'].includes(actor.role);
    const isWrite = (operation === 'object' && ['POST','PUT','DELETE'].includes(req.method));
    const body = req.method === 'GET' ? undefined : await req.arrayBuffer();
    const payload = req.headers.get('content-type')?.includes('application/json') && body?.byteLength ? JSON.parse(new TextDecoder().decode(body)) : {};
    let paths: string[] = [parts.join('/')];
    if (operation === 'list') paths = [payload.prefix || ''];
    else if (operation === 'sign' && !paths[0]) paths = payload.paths || [];
    else if (req.method === 'DELETE') paths = payload.prefixes || [];
    if (!paths.length || paths.length > 1000) return json(400, 'Invalid file list');
    for (const path of paths) {
      if (typeof path !== 'string' || path.includes('..') || path.includes('\\')) return json(400, 'Invalid file path');
      if (bucket === 'sap-exports') { if (!finance) return json(403, 'Finance access required'); continue; }
      if (bucket === 'company-assets') { if (isWrite && !admin) return json(403, 'Admin access required'); continue; }
      if (bucket === 'user-avatars') { if (isWrite && !admin && path.split('/')[0] !== actor.email) return json(403, 'You may only edit your own image'); continue; }
      const prefix = path.split('/')[0];
      if (finance) {
        if (isWrite && req.method !== 'DELETE' && /^C-\d+$/.test(prefix)) {
          const { error } = await db.from('storage_upload_owners').upsert({ bucket, prefix, user_email: actor.email }, { onConflict: 'bucket,prefix', ignoreDuplicates: true });
          if (error) throw error;
        }
        continue;
      }
      if (!prefix) return json(403, 'Choose a claim before listing files');
      let { data: claim } = await db.from('claims').select('user_email,manager_email,status').eq('claim_id',prefix).maybeSingle();
      // Upload folders are created before the claim gets its final ID.
      if (!claim && operation !== 'list') {
        const { data: linked } = await db.from('claims').select('user_email,manager_email,status').contains('drive_file_ids', [path]).limit(1).maybeSingle();
        claim = linked;
      }
      if (claim) {
        if (claim.user_email !== actor.email && claim.manager_email !== actor.email) return json(403, 'This claim is not assigned to you');
        if (isWrite && (claim.user_email !== actor.email || !['Submitted','Rejected'].includes(claim.status))) return json(403, 'Attachments are locked for this claim');
      } else {
        if (!/^C-\d+$/.test(prefix)) return json(403, 'Unknown claim');
        if (isWrite && req.method !== 'DELETE') {
          const { error } = await db.from('storage_upload_owners').upsert({ bucket, prefix, user_email: actor.email }, { onConflict: 'bucket,prefix', ignoreDuplicates: true });
          if (error) throw error;
        }
        const { data: owner } = await db.from('storage_upload_owners').select('user_email').eq('bucket',bucket).eq('prefix',prefix).maybeSingle();
        if (owner?.user_email !== actor.email) return json(403, 'File belongs to another submission');
      }
    }
    const headers = new Headers({ authorization: `Bearer ${secret}`, apikey: secret });
    for (const name of ['content-type','cache-control','x-upsert','range']) { const value=req.headers.get(name); if (value) headers.set(name,value); }
    const upstream = await fetch(parsed, { method:req.method, headers, body });
    const responseHeaders = new Headers(cors);
    for (const name of ['content-type','content-disposition','content-range']) { const value=upstream.headers.get(name); if(value) responseHeaders.set(name,value); }
    return new Response(upstream.body,{status:upstream.status,headers:responseHeaders});
  } catch (error) { console.error('Storage request failed', error instanceof Error ? error.message : 'unknown'); return json(400,'File request could not be completed'); }
});
