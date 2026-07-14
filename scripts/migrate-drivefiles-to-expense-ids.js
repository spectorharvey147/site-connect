import fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please provide SUPABASE_URL and SUPABASE_KEY environment variables.');
  process.exit(1);
}

const BASE = SUPABASE_URL.replace(/\/$/, '');

async function fetchJson(path, method = 'GET', body = null) {
  const url = `${BASE}${path}`;
  const opts = { method, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  if (!res.ok) { const txt = await res.text(); throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`); }
  // Some endpoints (PATCH) return an empty body. Safely handle empty responses.
  const txt = await res.text();
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch (err) {
    throw new Error(`Failed to parse JSON response from ${url}: ${err.message}`);
  }
}

function unique(arr) { return Array.from(new Set((arr || []).map(a => String(a || '').trim()).filter(Boolean))); }

(async function main(){
  try {
    console.log('Scanning claims for drive_file_ids containing expense- folders...');
    const claims = await fetchJson('/rest/v1/claims?select=claim_id,claim_number,drive_file_ids&limit=2000');
    const proposals = [];
    const backup = { ts: new Date().toISOString(), entries: [] };

    for (const claim of claims) {
      const top = Array.isArray(claim.drive_file_ids) ? claim.drive_file_ids.map(s => String(s || '').trim()) : [];
      const expenseFiles = top.filter(f => /\/expense-\d+\//.test(f) || /expense-\d+\//.test(f));
      if (expenseFiles.length === 0) continue;

      // fetch expense rows ordered by created_at
      const expenses = await fetchJson(`/rest/v1/expense_items?claim_id=eq.${encodeURIComponent(claim.claim_id)}&select=id,attachment_ids,created_at&order=created_at.asc`);
      if (!Array.isArray(expenses) || expenses.length === 0) continue;

      const expenseUpdates = {}; // expenseId -> [filePaths]
      const topKeeps = [];

      for (const f of expenseFiles) {
        // try extract expense index from path
        const m = f.match(/expense-(\d+)\//);
        if (m) {
          const idx = parseInt(m[1], 10) - 1;
          const row = expenses[idx];
          if (row) {
            expenseUpdates[row.id] = expenseUpdates[row.id] || [];
            expenseUpdates[row.id].push(f);
            continue;
          }
        }
        // if not matched, keep at top
        topKeeps.push(f);
      }

      if (Object.keys(expenseUpdates).length === 0) continue;

      // record backup of current DB values
      backup.entries.push({ claim_number: claim.claim_number, claim_id: claim.claim_id, original_drive_file_ids: top, expense_rows: expenses.map(e => ({ id: e.id, attachment_ids: e.attachment_ids || [] })) });
      proposals.push({ claim_number: claim.claim_number, claim_id: claim.claim_id, expenseUpdates, topKeeps });
    }

    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    const backupPath = `scripts/backups/migrate-drivefiles-backup-${ts}.json`;
    fs.mkdirSync('scripts/backups', { recursive: true });
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`Backup saved to ${backupPath}`);

    if (proposals.length === 0) {
      console.log('No drive_file_ids with expense- folder patterns found to migrate.');
      process.exit(0);
    }

    console.log(`Proposed migrations for ${proposals.length} claims:`);
    proposals.forEach(p => {
      console.log(`${p.claim_number} ${p.claim_id}`);
      for (const [eid, files] of Object.entries(p.expenseUpdates)) files.forEach(f => console.log(`  -> expense ${eid}: ${f}`));
    });

    const apply = process.argv.includes('--apply');
    if (!apply) {
      console.log('\nDRY-RUN finished. To apply these migrations run:');
      console.log('  SUPABASE_URL=... SUPABASE_KEY=... node scripts/migrate-drivefiles-to-expense-ids.js --apply');
      process.exit(0);
    }

    console.log('\nApplying migrations...');
    let applied = 0;
    for (const p of proposals) {
      for (const [expenseId, files] of Object.entries(p.expenseUpdates)) {
        // fetch current attachment_ids
        const cur = await fetchJson(`/rest/v1/expense_items?id=eq.${encodeURIComponent(expenseId)}&select=attachment_ids`);
        const curArr = (Array.isArray(cur) && cur[0] && Array.isArray(cur[0].attachment_ids)) ? cur[0].attachment_ids : [];
        const merged = unique([...curArr, ...files]);
        // patch
        await fetchJson(`/rest/v1/expense_items?id=eq.${encodeURIComponent(expenseId)}`, 'PATCH', { attachment_ids: merged });
        console.log(`Updated expense ${expenseId}: +${files.length}`);
        applied++;
      }
    }

    console.log(`\nApplied ${applied} expense updates. Backup: ${backupPath}`);
    console.log('Done. Re-run UI checks to confirm attachments are visible.');
    process.exit(0);

  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
