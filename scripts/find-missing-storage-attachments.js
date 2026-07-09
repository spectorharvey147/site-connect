import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please provide SUPABASE_URL and SUPABASE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL.replace(/\/$/, ''), SUPABASE_KEY);

function normalizeFileId(fileId) {
  return String(fileId || '').trim();
}

async function listStorageFilesRecursively(prefix) {
  const results = [];
  const queue = [prefix.replace(/\/$/, '')];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    const { data, error } = await supabase.storage.from('claim-attachments').list(currentPath, { limit: 1000 });
    if (error || !Array.isArray(data)) {
      throw new Error(`Failed to list storage for ${currentPath}: ${error?.message || 'unknown error'}`);
    }
    for (const entry of data) {
      if (!entry || !entry.name) continue;
      const entryPath = `${currentPath}/${entry.name}`;
      const isFolder = entry.type === 'folder' || (entry.id == null && entry.metadata == null);
      if (isFolder) {
        queue.push(entryPath);
      } else {
        results.push(entryPath);
      }
    }
  }

  return results;
}

(async function main() {
  try {
    console.log('Scanning claims for storage files missing from DB...');

    const { data: claims, error: claimsError } = await supabase.from('claims').select('claim_id,claim_number,drive_file_ids');
    if (claimsError) throw new Error(`Failed to fetch claims: ${claimsError.message}`);
    if (!Array.isArray(claims)) throw new Error('Unexpected response fetching claims');

    const missingClaims = [];
    const safeClaimUpdates = [];
    const apply = process.argv.includes('--apply');
    let totalClaims = 0;

    for (const claim of claims) {
      if (!claim.claim_id) continue;
      totalClaims += 1;

      const { data: expenses, error: expensesError } = await supabase.from('expense_items').select('attachment_ids').eq('claim_id', claim.claim_id);
      if (expensesError) throw new Error(`Failed to fetch expense rows for ${claim.claim_id}: ${expensesError.message}`);

      const dbFileIds = new Set();
      if (Array.isArray(claim.drive_file_ids)) {
        claim.drive_file_ids.forEach((id) => {
          const normalized = normalizeFileId(id);
          if (normalized) dbFileIds.add(normalized);
        });
      }
      if (Array.isArray(expenses)) {
        expenses.forEach((row) => {
          if (Array.isArray(row.attachment_ids)) {
            row.attachment_ids.forEach((id) => {
              const normalized = normalizeFileId(id);
              if (normalized) dbFileIds.add(normalized);
            });
          }
        });
      }

      const storageFiles = await listStorageFilesRecursively(claim.claim_id);
      const missingInDb = storageFiles.filter((fileId) => !dbFileIds.has(normalizeFileId(fileId)));
      if (missingInDb.length > 0) {
        const topLevelOnly = missingInDb.every((fileId) => {
          const relative = fileId.replace(`${claim.claim_id}/`, '');
          return !relative.includes('/');
        });
        missingClaims.push({ claimNumber: claim.claim_number || '(unknown)', claimId: claim.claim_id, missingInDb, claimDriveCount: Array.isArray(claim.drive_file_ids) ? claim.drive_file_ids.length : 0, expenseRows: Array.isArray(expenses) ? expenses.length : 0, topLevelOnly });
        if (apply && topLevelOnly) {
          const merged = Array.from(new Set([...(Array.isArray(claim.drive_file_ids) ? claim.drive_file_ids.map(normalizeFileId) : []), ...missingInDb.map(normalizeFileId)]));
          safeClaimUpdates.push({ claimId: claim.claim_id, claimNumber: claim.claim_number, originalDriveFileIds: Array.isArray(claim.drive_file_ids) ? claim.drive_file_ids : [], updatedDriveFileIds: merged, missingInDb });
        }
      }
    }

    console.log(`\nScanned ${totalClaims} claims.`);
    console.log(`Claims with storage-only files: ${missingClaims.length}`);
    for (const claim of missingClaims) {
      console.log(`\nClaim: ${claim.claimNumber} (${claim.claimId})`);
      console.log(`  drive_file_ids count: ${claim.claimDriveCount}`);
      console.log(`  expense rows: ${claim.expenseRows}`);
      console.log(`  top-level only: ${claim.topLevelOnly}`);
      console.log(`  missing files: ${claim.missingInDb.length}`);
      claim.missingInDb.slice(0, 20).forEach((fileId, idx) => {
        console.log(`    [${idx + 1}] ${fileId}`);
      });
      if (claim.missingInDb.length > 20) {
        console.log(`    ... and ${claim.missingInDb.length - 20} more`);
      }
    }

    if (apply) {
      if (safeClaimUpdates.length === 0) {
        console.log('\nNo safe top-level claim attachment updates to apply.');
        process.exit(0);
      }
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backup = { ts: new Date().toISOString(), updates: safeClaimUpdates };
      const fs = await import('fs');
      const backupPath = `scripts/backups/missing-storage-attachments-backup-${ts}.json`;
      fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
      console.log(`\nBackup written to ${backupPath}`);

      for (const update of safeClaimUpdates) {
        console.log(`Applying claim-level patch for ${update.claimNumber || update.claimId}`);
        const { error } = await supabase.from('claims').update({ drive_file_ids: update.updatedDriveFileIds }).eq('claim_id', update.claimId);
        if (error) {
          throw new Error(`Failed to update claim ${update.claimId}: ${error.message}`);
        }
      }
      console.log(`\nApplied ${safeClaimUpdates.length} claim-level drive_file_ids updates.`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
