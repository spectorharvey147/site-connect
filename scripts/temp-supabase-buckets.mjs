import { createClient } from '@supabase/supabase-js';
const url = 'https://ixlmzpweixniuvbfyalo.supabase.co';
const key = 'sb_publishable_M5pIDqMAtmepJzXsV4vLxA_LN6u55_c';
const supabase = createClient(url, key);
const result = await supabase.storage.listBuckets();
console.log(JSON.stringify(result, null, 2));
