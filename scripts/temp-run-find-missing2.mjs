import { execSync } from 'child_process';
try {
  const out = execSync('node scripts/find-missing-storage-attachments.js --apply', { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  console.log('OUT:');
  console.log(out);
} catch (error) {
  console.error('ERR:');
  console.error(error.message);
  if (error.stdout) console.error('STDOUT:', error.stdout.toString());
  if (error.stderr) console.error('STDERR:', error.stderr.toString());
}
