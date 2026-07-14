const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
import fs from 'fs';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please provide SUPABASE_URL and SUPABASE_KEY environment variables.');
  process.exit(1);
}

const BASE = SUPABASE_URL.replace(/\/$/, '');

async function fetchJson(path, method = 'GET', body = null) {
  const url = `${BASE}${path}`;
  const opts = { method, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt}`);
  }
  return res.json();
}

async function listStorageObjects(prefix) {
  // Supabase storage list endpoint
  const url = `/storage/v1/object/list/claim-attachments?prefix=${encodeURIComponent(prefix)}`;
  try {
    const res = await fetch(BASE + url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    if (!res.ok) {
      // fallback to empty
      return [];
    }
    return await res.json();
  } catch (e) {
    return [];
  }
}

function unique(arr) {
  return Array.from(new Set((arr || []).map((a) => String(a || '').trim()).filter(Boolean)));
}

(async function main() {
  try {
    console.log('Running safe sync: dry-run + backup + optional apply');

    // 1) Fetch all claims (we'll page if needed)
    const claims = await fetchJson('/rest/v1/claims?select=claim_id,claim_number,drive_file_ids&limit=1000');
    console.log(`Found ${claims.length} claims to inspect`);

    const backup = { generatedAt: new Date().toISOString(), updates: [] };
    const proposed = [];

    for (const claim of claims) {
      const claimId = claim.claim_id;
      // list storage objects under claim folder
      const storageObjects = await listStorageObjects(claimId + '/');
      const storageNames = Array.isArray(storageObjects) ? storageObjects.map(o => o.name) : [];
      if (storageNames.length === 0) continue;

      // fetch expense rows for claim ordered by created_at (deterministic ordering)
      const expenses = await fetchJson(`/rest/v1/expense_items?claim_id=eq.${encodeURIComponent(claimId)}&select=id,attachment_ids,created_at&order=created_at.asc`);

      // build current DB lists
      const top = Array.isArray(claim.drive_file_ids) ? claim.drive_file_ids.map(s => String(s || '').trim()) : [];
      const rowsFlat = expenses.flatMap(e => Array.isArray(e.attachment_ids) ? e.attachment_ids.map(s => String(s || '').trim()) : []);

      // determine mapping by inspecting storage paths
      const topFilesToAdd = [];
      const expenseUpdates = {}; // expenseId -> [filePaths]

      for (const name of storageNames) {
        const fullPath = `${claimId}/${name}`;
        // if already present in top or rows, skip
        if (top.includes(fullPath) || rowsFlat.includes(fullPath)) continue;

        // detect expense folder pattern: expense-<n>/...
        const m = name.match(/^expense-(\d+)\/(.+)$/);
        if (m) {
          const idx = parseInt(m[1], 10) - 1; // expense-1 => index 0
          const expenseRow = expenses[idx];
          if (expenseRow) {
            expenseUpdates[expenseRow.id] = expenseUpdates[expenseRow.id] || [];
            expenseUpdates[expenseRow.id].push(fullPath);
            continue;
          }
          // fallback: if no matching expense row, put into top-level
          topFilesToAdd.push(fullPath);
          continue;
        }

        // if filename contains claimId/<something> with 'expense-' embedded elsewhere
        const m2 = name.match(/expense-(\d+)/);
        if (m2) {
          const idx = parseInt(m2[1], 10) - 1;
          const expenseRow = expenses[idx];
          if (expenseRow) {
            expenseUpdates[expenseRow.id] = expenseUpdates[expenseRow.id] || [];
            expenseUpdates[expenseRow.id].push(fullPath);
            continue;
          }
        }

        // otherwise treat as top-level claim attachment
        topFilesToAdd.push(fullPath);
      }

      // prepare proposed update if any
      const anyExpenseAdds = Object.keys(expenseUpdates).length > 0;
      const anyTopAdds = topFilesToAdd.length > 0;
      if (!anyExpenseAdds && !anyTopAdds) continue;

      proposed.push({ claim_number: claim.claim_number, claim_id: claimId, topAdds: topFilesToAdd, expenseAdds: expenseUpdates, expensesCount: expenses.length });

      // record backup (current DB values)
      const backupEntry = { claim_number: claim.claim_number, claim_id: claimId, original_drive_file_ids: top, expense_rows: expenses.map(e => ({ id: e.id, attachment_ids: e.attachment_ids || [] })) };
      backup.updates.push(backupEntry);
    }

    // write dry-run backup file
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `scripts/backups/claim-attachments-backup-${ts}.json`;
    try {
      fs.mkdirSync('scripts/backups', { recursive: true });
      fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
      console.log(`Backup written to ${backupPath}`);
    } catch (e) {
      console.warn('Failed to write backup locally:', e.message);
    }

    console.log(`Proposed updates for ${proposed.length} claims.`);
    if (proposed.length === 0) {
      console.log('Nothing to update. Exiting.');
      process.exit(0);
    }

    // Print summary
    for (const p of proposed) {
      console.log(`\n${p.claim_number} (${p.claim_id}) -> topAdds=${p.topAdds.length} expenseAdds=${Object.keys(p.expenseAdds).length} expensesCount=${p.expensesCount}`);
      if (p.topAdds.length) p.topAdds.forEach(f => console.log(`  top: ${f}`));
      for (const [eid, files] of Object.entries(p.expenseAdds)) files.forEach(f => console.log(`  expense ${eid}: ${f}`));
    }

    // Prompt: apply changes?
    const apply = process.argv.includes('--apply');
    if (!apply) {
      console.log('\nDRY-RUN complete. No changes applied.');
      console.log('To apply the safe updates run:');
      console.log('\n  SUPABASE_URL=... SUPABASE_KEY=... node scripts/sync-storage-to-db-safe.js --apply\n');
      process.exit(0);
    }

    console.log('\nApplying changes now (safe mode) ...');
    let appliedCount = 0;

    for (const p of proposed) {
      // 1) patch expense rows
      for (const [expenseId, files] of Object.entries(p.expenseAdds)) {
        // fetch current
        const cur = await fetchJson(`/rest/v1/expense_items?id=eq.${encodeURIComponent(expenseId)}&select=attachment_ids`);
        const curArr = (Array.isArray(cur) && cur[0] && Array.isArray(cur[0].attachment_ids)) ? cur[0].attachment_ids : [];
        const merged = unique([...curArr, ...files]);
        // patch
        await fetchJson(`/rest/v1/expense_items?id=eq.${encodeURIComponent(expenseId)}`, 'PATCH', { attachment_ids: merged });
        console.log(`  Updated expense ${expenseId}: +${files.length}`);
        appliedCount++;
      }

      // 2) patch claim drive_file_ids if needed
      if (p.topAdds.length > 0) {
        const curc = await fetchJson(`/rest/v1/claims?claim_id=eq.${encodeURIComponent(p.claim_id)}&select=drive_file_ids`);
        const curTop = (Array.isArray(curc) && curc[0] && Array.isArray(curc[0].drive_file_ids)) ? curc[0].drive_file_ids : [];
        const mergedTop = unique([...curTop, ...p.topAdds]);
        await fetchJson(`/rest/v1/claims?claim_id=eq.${encodeURIComponent(p.claim_id)}`, 'PATCH', { drive_file_ids: mergedTop });
        console.log(`  Updated claim ${p.claim_number}: +${p.topAdds.length} top files`);
        appliedCount++;
      }
    }

    console.log(`\nApplied ${appliedCount} updates. Backup file: ${backupPath}`);
    console.log('Done. Please re-check UI or run inspection scripts to verify.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
