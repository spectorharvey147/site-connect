import { execSync } from 'child_process';
try {
  const result = execSync('taskkill /F /IM node.exe', { encoding: 'utf8' });
  console.log('Killed node processes:', result);
} catch (e) {
  console.log('Result:', e.stdout || e.message);
}
