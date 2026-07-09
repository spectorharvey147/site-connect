const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please provide SUPABASE_URL and SUPABASE_KEY environment variables.');
  process.exit(1);
}

async function fetchJson(path) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method: 'GET',
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

async function updateJson(path, data, method = 'PATCH') {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

(async function main() {
  try {
    console.log('Fetching all claims with empty expense attachment_ids...');
    
    // Get all expense items with empty attachment_ids
    const expenses = await fetchJson(`/rest/v1/expense_items?attachment_ids=eq.{}or(attachment_ids.is.null)`);
    console.log(`Found ${expenses.length} expense rows with empty attachment_ids`);
    
    let updated = 0;
    
    for (const exp of expenses) {
      try {
        // List files in storage for this expense (in the claim folder/expense-{id} path)
        // The pattern is: {claimIdInternal}/{expenseId}-*.* for row attachments
        // But we need to check the storage structure
        
        const claimId = exp.claim_id;
        console.log(`\nProcessing expense ${exp.id} (claim_id: ${claimId})`);
        
        // For now, we'll just check if the database already has the right data
        // In practice, we'd need to list storage and infer attachment_ids
        // Since storage paths are {claimFolder}/expense-{expenseNumber}/{fileId}
        // We can't easily reverse-engineer this without more info
        
        // Instead, mark as reviewed but unchanged
        console.log(`  - Expense ${exp.id}: attachment_ids is empty; manual review needed`);
      } catch (err) {
        console.error(`  Error processing expense ${exp.id}:`, err.message);
      }
    }
    
    console.log(`\nNote: To properly populate attachment_ids, you need to either:`);
    console.log(`1. Re-submit the claim (which will recapture attachments)`);
    console.log(`2. Manually map storage files to database records`);
    console.log(`3. Implement a storage sync function that lists claim folders and extracts file IDs`);
    
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exitCode = 1;
  }
})();
