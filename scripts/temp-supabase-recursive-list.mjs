import { createClient } from '@supabase/supabase-js';
const url = 'https://ixlmzpweixniuvbfyalo.supabase.co';
const key = 'sb_publishable_M5pIDqMAtmepJzXsV4vLxA_LN6u55_c';
const supabase = createClient(url, key);

const prefix = 'C-1783393378110';
const results = [];
const queue = [prefix];
while (queue.length > 0) {
  const current = queue.shift();
  const { data, error } = await supabase.storage.from('claim-attachments').list(current, { limit: 100 });
  console.log('LIST', current, 'error', JSON.stringify(error));
  if (error || !Array.isArray(data)) break;
  for (const entry of data) {
    if (!entry || !entry.name) continue;
    const path = `${current}/${entry.name}`;
    const isFolder = entry.type === 'folder' || (entry.id == null && entry.metadata == null);
    if (isFolder) {
      queue.push(path);
    } else {
      results.push(path);
    }
  }
}
console.log('results', JSON.stringify(results, null, 2));
