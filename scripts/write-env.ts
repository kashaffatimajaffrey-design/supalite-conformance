/**
 * Writes .env from the running local Supabase stack, so nobody copies keys by hand.
 *
 *   npx supabase start
 *   npm run env
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let out: string;
try {
  out = execSync('npx --no-install supabase status -o env', { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
} catch {
  console.error('Could not read `supabase status`. Is Docker running, and did `npx supabase start` finish?');
  process.exit(1);
}
const vars = Object.fromEntries(
  out
    .split(/\r?\n/)
    .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [m[1]!, m[2]!]),
);
if (!vars.API_URL || !vars.ANON_KEY) {
  console.error('supabase status did not report API_URL and ANON_KEY:\n' + out);
  process.exit(1);
}
writeFileSync(
  `${root}.env`,
  `REFERENCE_URL=${vars.API_URL}\nREFERENCE_KEY=${vars.ANON_KEY}\nTARGET_URL=http://127.0.0.1:54400\n`,
);
console.log(`wrote .env (REFERENCE_URL=${vars.API_URL})`);
