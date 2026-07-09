const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please provide SUPABASE_URL and SUPABASE_KEY environment variables.');
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

(async function main() {
  try {
    console.log('Scanning claims for row attachments...');

    const claims = await fetchJson('/rest/v1/claims?select=claim_id,claim_number,drive_file_ids&limit=200');
    let found = 0;
    const results = [];

    for (const claim of claims) {
      const expenses = await fetchJson(`/rest/v1/expense_items?claim_id=eq.${encodeURIComponent(claim.claim_id)}&select=attachment_ids`);
      const top = Array.isArray(claim.drive_file_ids) ? claim.drive_file_ids : [];
      const rows = expenses.flatMap((e) => Array.isArray(e.attachment_ids) ? e.attachment_ids : []);
      const unique = Array.from(new Set([...top, ...rows].map((id) => String(id || '').trim()).filter(Boolean)));
      if (unique.length > 1 || rows.length > 0) {
        results.push({
          claim_number: claim.claim_number,
          claim_id: claim.claim_id,
          top_count: top.length,
          row_count: rows.length,
          unique_count: unique.length,
          row_attachments: rows,
        });
      }
    }

    console.log(`\nFound ${results.length} claims with any expense attachment rows (including duplicates).`);
    if (results.length > 0) {
      console.log('\nFirst 50 results:');
      results.slice(0, 50).forEach((res) => {
        console.log(`${res.claim_number} ${res.claim_id} top=${res.top_count} rows=${res.row_count} unique=${res.unique_count}`);
      });
    }
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
