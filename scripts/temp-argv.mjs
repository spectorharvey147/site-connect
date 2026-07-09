import { execSync } from 'child_process';
const out = execSync('node -e "console.log(process.argv.join(\',\'))"', { encoding: 'utf8' });
console.log(out);