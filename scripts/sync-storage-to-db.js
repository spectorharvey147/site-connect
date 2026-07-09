const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please provide SUPABASE_URL and SUPABASE_KEY environment variables.');
  process.exit(1);
}

async function fetchJson(path, method = 'GET', body = null) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}${path}`;
  const options = {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function listStorageFiles(path) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/b/claim-attachments/o`;
  const res = await fetch(url + `?prefix=${encodeURIComponent(path)}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

(async function main() {
  try {
    console.log('Populating missing attachment_ids from storage...\n');
    
    // Get all claims
    const claims = await fetchJson('/rest/v1/claims?select=claim_id');
    console.log(`Found ${claims.length} claims\n`);
    
    let totalUpdated = 0;
    
    for (const claim of claims) {
      const claimId = claim.claim_id;
      
      // Get expense items for this claim
      const expenses = await fetchJson(`/rest/v1/expense_items?claim_id=eq.${encodeURIComponent(claimId)}&select=id`);
      
      for (let i = 0; i < expenses.length; i++) {
        const expense = expenses[i];
        const expenseNum = i + 1; // expense-1, expense-2, etc.
        const storagePath = `${claimId}/expense-${expenseNum}`;
        
        try {
          // List files in this expense folder
          const files = await listStorageFiles(storagePath);
          const fileIds = (files || [])
            .filter(f => f.name && !f.name.endsWith('/'))
            .map(f => `${claimId}/expense-${expenseNum}/${f.name}`)
            .filter(Boolean);
          
          if (fileIds.length > 0) {
            console.log(`Updating ${claimId} expense-${expenseNum}: found ${fileIds.length} file(s)`);
            
            // Update the expense_items row
            await fetchJson(
              `/rest/v1/expense_items?id=eq.${encodeURIComponent(expense.id)}`,
              'PATCH',
              { attachment_ids: fileIds }
            );
            
            totalUpdated++;
            fileIds.forEach(id => console.log(`  - ${id}`));
          }
        } catch (err) {
          console.error(`  Error processing ${claimId}/expense-${expenseNum}:`, err.message);
        }
      }
    }
    
    console.log(`\n✓ Updated ${totalUpdated} expense rows with attachment_ids from storage`);
    
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exitCode = 1;
  }
})();
