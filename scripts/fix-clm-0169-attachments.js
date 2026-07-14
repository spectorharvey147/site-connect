const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please provide SUPABASE_URL and SUPABASE_KEY environment variables.');
  process.exit(1);
}

// Map of claim_id -> [{ expenseIndex, fileIds: [...] }]
const claimsWithRowAttachments = {
  'C-1783393378110': [
    { expenseIndex: 0, fileIds: ['C-1783393378110/expense-1/1783393769185-1.jpg', 'C-1783393378110/expense-1/1783393652707-0.jpg'] }
  ]
};

async function updateExpenseAttachments(expenseId, fileIds) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/expense_items?id=eq.${encodeURIComponent(expenseId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ attachment_ids: fileIds }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function getExpensesForClaim(claimId) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/expense_items?claim_id=eq.${encodeURIComponent(claimId)}&select=id,category`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch expenses');
  return res.json();
}

(async function main() {
  try {
    console.log('Manually syncing row attachments to database...\n');
    
    let totalUpdated = 0;
    
    for (const [claimId, expenseMappings] of Object.entries(claimsWithRowAttachments)) {
      console.log(`Processing claim ${claimId}...`);
      
      // Get expenses for this claim
      const expenses = await getExpensesForClaim(claimId);
      console.log(`  Found ${expenses.length} expense rows`);
      
      for (const mapping of expenseMappings) {
        const expense = expenses[mapping.expenseIndex];
        if (!expense) {
          console.log(`  WARNING: Expense index ${mapping.expenseIndex} not found`);
          continue;
        }
        
        console.log(`  Updating expense ${mapping.expenseIndex} (${expense.category}) with ${mapping.fileIds.length} file(s)`);
        mapping.fileIds.forEach(f => console.log(`    - ${f}`));
        
        await updateExpenseAttachments(expense.id, mapping.fileIds);
        totalUpdated++;
      }
    }
    
    console.log(`\n✓ Successfully updated ${totalUpdated} expense rows`);
    console.log('Now run: node scripts/check-claims-attachments.js CLM-0169 to verify');
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  }
})();
