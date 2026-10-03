/**
 * results.json → static HTML report (one self-contained file, no external assets).
 *
 *   npm run report                     results/results.json → site/index.html
 *   npm run report -- in.json outdir
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SEVERITY } from '../classify.ts';

const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const input = process.argv[2] ?? root('results/results.json');
const outDir = process.argv[3] ?? root('site');

const results = JSON.parse(readFileSync(input, 'utf8'));
const template = readFileSync(fileURLToPath(new URL('./template.html', import.meta.url)), 'utf8');

// Safe to embed in <script type="application/json">.
const embed = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

const html = template
  .replace('/*__RESULTS__*/', () => embed(results))
  .replace('/*__SEVERITY__*/', () => embed(SEVERITY))
  .replace('/*__REPO__*/', () => embed(process.env.GITHUB_REPOSITORY ?? 'kashaffatimajaffrey-design/supalite-conformance'));

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/index.html`, html);
copyFileSync(input, `${outDir}/results.json`);
console.log(`wrote ${outDir}/index.html`);
