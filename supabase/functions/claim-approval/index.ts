import { createClient } from 'npm:@supabase/supabase-js@2';
import { profileSignatureStoragePath, serverObservedClientIp } from './identity-helpers.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,x-claims-token',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function ensurePrivateBucket(db: ReturnType<typeof createClient>) {
  const { data, error } = await db.storage.getBucket('approval-signatures');
  if (data) {
    if (data.public) throw new Error('Approval signature storage must remain private');
    return;
  }
  if (!error) throw new Error('Could not verify approval signature storage');
  const { error: createError } = await db.storage.createBucket('approval-signatures', {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg'],
  });
  if (!createError) return;
  const { data: existing, error: verifyError } = await db.storage.getBucket('approval-signatures');
  if (verifyError || !existing || existing.public) throw new Error('Could not verify private approval signature storage');
}

async function snapshotSignature(db: ReturnType<typeof createClient>, signatureUrl: string | null, claimId: string, stage: string, base: string) {
  const source = profileSignatureStoragePath(signatureUrl);
  if (!signatureUrl) return null;
  if (!source) throw new Error('The saved approval signature cannot be safely read');
  await ensurePrivateBucket(db);
  const { data: blob, error: downloadError } = await db.storage.from('user-avatars').download(source);
  if (downloadError || !blob || blob.size === 0) throw new Error('Could not preserve the current approval signature');
  const prefix = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const detected = prefix.length >= 8 && prefix[0] === 0x89 && prefix[1] === 0x50 && prefix[2] === 0x4e && prefix[3] === 0x47
    ? 'image/png'
    : prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff
      ? 'image/jpeg'
      : '';
  const mime = detected || blob.type.toLowerCase();
  const extension = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : '';
  if (!extension) throw new Error('Approval signatures must be PNG or JPEG images');
  const path = `${crypto.randomUUID()}/${stage}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await db.storage.from('approval-signatures').upload(path, blob, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: false,
  });
  if (uploadError) throw new Error('Could not save the approval-time signature snapshot');
  return path;
}

async function signedApprovalSignatures(db: ReturnType<typeof createClient>, actor: any, claimIds: unknown) {
  if (!Array.isArray(claimIds) || claimIds.length < 1 || claimIds.length > 100) throw new Error('Choose up to 100 claims');
  const ids = [...new Set(claimIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const { data: claims, error } = await db.from('claims').select('claim_id,user_email,manager_email').in('claim_id', ids);
  if (error) throw error;
  if ((claims || []).length !== ids.length) throw new Error('One or more claims are unavailable');
  const elevated = ['Admin', 'Super Admin', 'Accounts'].includes(actor.role);
  const allowed = (claims || []).every((claim) => elevated || claim.user_email === actor.email || claim.manager_email === actor.email);
  if (!allowed) throw new Error('You cannot view these approval signatures');
  const { data: events, error: eventError } = await db.from('claim_approval_events')
    .select('id,signature_snapshot_url').in('claim_id', ids).not('signature_snapshot_url', 'is', null);
  if (eventError) throw eventError;
  const result: Record<string, string> = {};
  for (const event of events || []) {
    const path = String(event.signature_snapshot_url || '');
    if (!path || path.startsWith('http') || path.includes('..') || path.includes('\\')) continue;
    const { data, error: signError } = await db.storage.from('approval-signatures').createSignedUrl(path, 14400);
    if (!signError && data?.signedUrl) result[event.id] = data.signedUrl;
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respond(405, { message: 'Use POST' });
  const base = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !serviceKey) return respond(500, { message: 'Approval service is not configured' });
  const db = createClient(base, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const body = await req.json();
    const token = String(body?.token || req.headers.get('x-claims-token') || '');
    if (!token || token.length > 256) return respond(401, { message: 'Sign in again' });
    const { data: actor, error: actorError } = await db.rpc('app_session', { p_token: token });
    if (actorError || !actor?.email || !actor?.role) return respond(401, { message: 'Your session has expired' });

    if (body.action === 'signatures') {
      return respond(200, { signatures: await signedApprovalSignatures(db, actor, body.claimIds) });
    }

    const claimId = String(body.claimId || '').trim();
    const stage = String(body.stage || '');
    if (!claimId || claimId.length > 160 || !['admin', 'manager', 'super-admin', 'accounts', 'payment'].includes(stage)) {
      return respond(400, { message: 'Invalid approval request' });
    }
    const { data: claim, error: claimError } = await db.from('claims').select('claim_id').eq('claim_id', claimId).maybeSingle();
    if (claimError || !claim) return respond(404, { message: 'Claim not found' });
    const eventId = String(body.eventId || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) return respond(400, { message: 'Invalid retry identifier' });
    const { data: priorEvents } = await db.from('claim_approval_events').select('approval_stage,action')
      .eq('claim_id', claimId).eq('idempotency_key', eventId);
    if (priorEvents?.length) {
      const stageName = ({ admin: 'Admin', manager: 'Manager', 'super-admin': 'HOD / Super Admin', accounts: 'Accounts', payment: 'Payment' } as Record<string, string>)[stage];
      const expectedAction = body.action === 'paid' ? 'Marked Paid' : body.action === 'reject' ? 'Rejected' : stage === 'manager' ? 'Approved' : stage === 'accounts' ? 'Verified' : 'Approved';
      if (priorEvents.some((event) => event.approval_stage === stageName && event.action === expectedAction)) {
        return respond(200, { ok: true, eventId, replayed: true });
      }
      return respond(409, { message: 'This retry identifier belongs to another approval action' });
    }
    const { data: profile, error: profileError } = await db.from('users').select('signature_url').eq('email', actor.email).maybeSingle();
    if (profileError) return respond(400, { message: 'Could not read the current approval signature' });
    const snapshotPath = await snapshotSignature(db, profile?.signature_url || null, claimId, stage, base);
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const requestBody = {
      p_token: token,
      p_claim_id: claimId,
      p_stage: stage,
      p_action: String(body.action || 'approve'),
      p_payload: payload,
      p_client_ip: serverObservedClientIp(req.headers),
      p_user_agent: (req.headers.get('user-agent') || '').slice(0, 1000),
      p_signature_snapshot_path: snapshotPath,
      p_event_id: eventId,
    };
    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/rpc/claim_approval_action`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'x-claims-token': token },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      if (snapshotPath) await db.storage.from('approval-signatures').remove([snapshotPath]);
      throw error;
    }
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      if (snapshotPath) await db.storage.from('approval-signatures').remove([snapshotPath]);
      return respond(response.status >= 400 && response.status < 500 ? response.status : 400, { message: failure.message || 'Approval could not be completed' });
    }
    return respond(200, { ok: true, eventId });
  } catch (error) {
    console.error('Approval request failed', error instanceof Error ? error.message : 'unknown');
    return respond(400, { message: error instanceof Error ? error.message : 'Approval could not be completed' });
  }
});
