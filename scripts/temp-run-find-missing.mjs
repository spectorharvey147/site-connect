import { execSync } from 'child_process';
const out = execSync('node scripts/find-missing-storage-attachments.js', { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
console.log(out);