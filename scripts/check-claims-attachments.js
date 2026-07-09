const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const claimNumbers = process.argv.slice(2);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please provide SUPABASE_URL and SUPABASE_KEY environment variables.');
  process.exit(1);
}
if (claimNumbers.length === 0) {
  console.error('Usage: node check-claims-attachments.js CLM-XXXX [CLM-YYYY ...]');
  process.exit(1);
}

async function fetchJson(path) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

function publicUrlFor(fileId) {
  const encoded = encodeURIComponent(fileId).replace(/%2F/g, '/');
  return `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/claim-attachments/${encoded}`;
}

(async function main() {
  try {
    for (const claimNumber of claimNumbers) {
      console.log('\n---');
      console.log(`Claim: ${claimNumber}`);

      // fetch claim row
      const claims = await fetchJson(`/rest/v1/claims?claim_number=eq.${encodeURIComponent(claimNumber)}&select=*`);
      if (!claims || claims.length === 0) {
        console.log('Claim not found');
        continue;
      }
      const claim = claims[0];
      console.log('internal claim_id:', claim.claim_id || '(none)');

      const topFileIds = Array.isArray(claim.drive_file_ids) ? claim.drive_file_ids : (claim.fileIds || []);
      console.log('final claim (drive_file_ids) count:', topFileIds.length);
      if (topFileIds.length > 0) {
        topFileIds.forEach((id, i) => {
          console.log(`  [final ${i+1}] ${id}`);
          console.log(`    public: ${publicUrlFor(id)}`);
        });
      }

      // expense rows
      const claimId = claim.claim_id;
      if (!claimId) {
        console.log('No internal claim_id present; skipping expense rows.');
        continue;
      }
      const expenses = await fetchJson(`/rest/v1/expense_items?claim_id=eq.${encodeURIComponent(claimId)}&select=id,category,project_code,expense_date,attachment_ids`);
      console.log('expense rows:', expenses.length);
      let rowCount = 0;
      const rowFileIds = [];
      for (const r of expenses) {
        const ids = Array.isArray(r.attachment_ids) ? r.attachment_ids : [];
        console.log(`  expense ${r.id || rowCount+1} (${r.category || ''}): ${ids.length} attachment(s)`);
        ids.forEach((id, i) => {
          console.log(`    [row ${rowCount+1}.${i+1}] ${id}`);
          console.log(`      public: ${publicUrlFor(id)}`);
        });
        rowFileIds.push(...ids);
        rowCount += 1;
      }

      const combined = Array.from(new Set([...(topFileIds || []), ...(rowFileIds || [])].map(id => String(id || '').trim()).filter(Boolean)));
      console.log('Combined unique attachments count:', combined.length);
      combined.forEach((id, i) => console.log(`  [all ${i+1}] ${id} -> ${publicUrlFor(id)}`));
    }
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exitCode = 1;
  }
})();
