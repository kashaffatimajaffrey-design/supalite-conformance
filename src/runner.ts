/**
 * Runs every case against the reference and the target, compares, classifies,
 * and writes results/results.json + results/summary.md.
 *
 *   npm run conformance                       both sides (needs REFERENCE_URL/KEY)
 *   npm run conformance -- --target-only      Lite only, no diff (no Docker needed)
 *   npm run conformance -- --only filters.    run cases whose id contains "filters."
 *   npm run conformance -- --fail-on S1       exit 1 if any S1 is found
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTargets, type Target } from '../targets/config.ts';
import { registeredCases, type Case, type CaseContext } from './defineCase.ts';
import { diff, normalize, normalizeThrown, type Difference, type Json, type Outcome } from './normalize.ts';
import { classify, SEVERITY, type Severity, type Verdict } from './classify.ts';
import { ROOT_CAUSES, type RootCause } from '../cases/_rootCauses.ts';

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const CALL_TIMEOUT_MS = 20_000;

export interface CaseResult {
  id: string;
  category: string;
  why: string;
  docs?: string;
  knownGap?: string;
  rootCauses: string[];
  verdict: Verdict;
  reason: string;
  differences: Difference[];
  reference: Json | null;
  target: Json;
  ms: { reference: number | null; target: number };
}

export interface Results {
  meta: {
    generatedAt: string;
    runId: string;
    mode: 'differential' | 'target-only';
    reference: { label: string; url: string } | null;
    target: { label: string; url: string };
    versions: Record<string, string>;
    rootCauses: Record<string, RootCause>;
  };
  totals: Record<Verdict | 'unverified', number>;
  /** Distinct root causes among failing cases, and failing cases with none attributed. */
  rootCauseTotals: { distinct: number; unattributed: number; failing: number };
  cases: (CaseResult | (Omit<CaseResult, 'verdict'> & { verdict: 'unverified' }))[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function makeClient(t: Target): SupabaseClient {
  return createClient(t.url, t.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function contextFor(t: Target, runId: string): CaseContext {
  return {
    side: t.name,
    runId,
    client: () => makeClient(t),
    async signedIn(email, password) {
      const sb = makeClient(t);
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(`sign-in as ${email} failed on ${t.name}: ${error.message}`);
      return sb;
    },
  };
}

function withTimeout<T>(p: PromiseLike<T>, what: string): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${CALL_TIMEOUT_MS}ms: ${what}`)), CALL_TIMEOUT_MS).unref()),
  ]);
}

async function runOn(c: Case, t: Target, runId: string): Promise<{ outcome: Outcome; ms: number }> {
  const ctx = contextFor(t, runId);
  const started = performance.now();
  let outcome: Outcome;
  try {
    if (c.setup) await withTimeout(c.setup(ctx.client(), ctx), `${c.id} setup`);
    outcome = normalize(await withTimeout(c.run(ctx.client(), ctx), c.id), c.ignore);
  } catch (e) {
    outcome = normalizeThrown(e);
  } finally {
    if (c.teardown) await withTimeout(c.teardown(ctx.client(), ctx), `${c.id} teardown`).catch(() => {});
  }
  return { outcome, ms: Math.round(performance.now() - started) };
}

async function loadCases(only?: string): Promise<readonly Case[]> {
  const dir = root('cases');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_')).sort()) {
    await import(pathToFileURL(`${dir}/${f}`).href);
  }
  return registeredCases().filter((c) => !only || c.id.includes(only));
}

function versions(): Record<string, string> {
  const sh = (cmd: string) => {
    try {
      return execSync(cmd, { cwd: root(''), stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 }).toString().trim();
    } catch {
      return 'unknown';
    }
  };
  const pkg = (p: string) => {
    try {
      return JSON.parse(readFileSync(root(p), 'utf8')).version as string;
    } catch {
      return 'unknown';
    }
  };
  return {
    'supabase-lite commit': process.env.LITE_COMMIT ?? sh('git -C targets/supabase-lite rev-parse HEAD'),
    '@supabase/supabase-js': pkg('node_modules/@supabase/supabase-js/package.json'),
    'supabase CLI': process.env.SUPABASE_CLI_VERSION ?? sh('npx --no-install supabase --version'),
    'kit commit': process.env.GITHUB_SHA ?? sh('git rev-parse HEAD'),
    node: process.version,
  };
}

const ICON: Record<string, string> = { pass: 'PASS', S1: 'S1  ', S2: 'S2  ', S3: 'S3  ', bug: 'BUG ', S4: 'S4  ', 'kit-error': 'KIT!', unverified: '----' };
const isFailing = (v: string) => v !== 'pass' && v !== 'unverified';

async function main() {
  const { reference, target } = loadTargets();
  const targetOnly = process.argv.includes('--target-only');
  if (!reference && !targetOnly) {
    console.error('REFERENCE_URL and REFERENCE_KEY are not set. Start Supabase (`npx supabase start`) and fill .env,');
    console.error('or run `npm run conformance -- --target-only` to exercise the target alone.');
    process.exit(2);
  }
  const ref = targetOnly ? null : reference;
  const runId = process.env.RUN_ID ?? Date.now().toString(36);
  const cases = await loadCases(arg('only'));
  const results: Results['cases'] = [];

  console.log(`Running ${cases.length} cases  runId=${runId}`);
  console.log(`  reference: ${ref ? `${ref.label} @ ${ref.url}` : '(skipped: --target-only)'}`);
  console.log(`  target:    ${target.label} @ ${target.url}\n`);

  for (const c of cases) {
    const r = ref ? await runOn(c, ref, runId) : null;
    const t = await runOn(c, target, runId);
    const base = {
      id: c.id,
      category: c.category,
      why: c.why,
      ...(c.docs ? { docs: c.docs } : {}),
      ...(c.knownGap ? { knownGap: c.knownGap } : {}),
      rootCauses: c.rootCause === undefined ? [] : ([] as string[]).concat(c.rootCause),
      reference: r?.outcome.display ?? null,
      target: t.outcome.display,
      ms: { reference: r?.ms ?? null, target: t.ms },
    };
    if (!r) {
      results.push({ ...base, verdict: 'unverified', reason: 'No reference run.', differences: [] });
      console.log(`${ICON.unverified}  ${c.id}`);
      continue;
    }
    const { verdict, reason } = classify(r.outcome, t.outcome, { severity: c.severity, knownGap: !!c.knownGap });
    const differences = diff(r.outcome.compared, t.outcome.compared);
    results.push({ ...base, verdict, reason, differences });
    const first = differences[0];
    const hint = verdict === 'pass' || !first ? '' : `  ${first.path}: ${short(first.reference)} → ${short(first.target)}`;
    console.log(`${ICON[verdict]}  ${c.id.padEnd(48)}${hint}`);
  }

  const totals = { pass: 0, S1: 0, S2: 0, S3: 0, bug: 0, S4: 0, 'kit-error': 0, unverified: 0 } as Results['totals'];
  for (const r of results) totals[r.verdict]++;
  const failing = results.filter((r) => isFailing(r.verdict));
  const causes = new Set(failing.flatMap((r) => r.rootCauses));
  const rootCauseTotals = {
    distinct: causes.size,
    unattributed: failing.filter((r) => r.rootCauses.length === 0).length,
    failing: failing.length,
  };

  const out: Results = {
    meta: {
      generatedAt: new Date().toISOString(),
      runId,
      mode: ref ? 'differential' : 'target-only',
      reference: ref ? { label: ref.label, url: ref.url } : null,
      target: { label: target.label, url: target.url },
      versions: versions(),
      rootCauses: Object.fromEntries([...causes].sort().map((id) => [id, (ROOT_CAUSES as Record<string, RootCause>)[id]!])),
    },
    totals,
    rootCauseTotals,
    cases: results,
  };
  const dir = arg('out') ?? root('results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/results.json`, JSON.stringify(out, null, 2) + '\n');
  writeFileSync(`${dir}/summary.md`, summaryMarkdown(out));

  console.log(
    `\n${results.length} cases: ${totals.pass} pass, ${totals.S1} S1, ${totals.S2} S2, ${totals.S3} S3, ${totals.bug} bug, ${totals.S4} S4` +
      (totals['kit-error'] ? `, ${totals['kit-error']} kit errors` : '') +
      (totals.unverified ? `, ${totals.unverified} unverified` : ''),
  );
  if (failing.length) {
    console.log(
      `${failing.length} failing cases trace to ${rootCauseTotals.distinct} distinct root causes` +
        (rootCauseTotals.unattributed ? ` (+${rootCauseTotals.unattributed} failing cases unattributed)` : ''),
    );
  }
  console.log(`wrote ${dir}/results.json`);

  const failOn = arg('fail-on') as Severity | undefined;
  const order = ['S1', 'S2', 'S3', 'bug', 'S4'] as const;
  const failed = failOn && order.slice(0, order.indexOf(failOn) + 1).some((s) => totals[s] > 0);
  process.exit(totals['kit-error'] > 0 || failed ? 1 : 0);
}

function short(v: unknown): string {
  const s = v === undefined ? '(absent)' : JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
}

export function summaryMarkdown(r: Results): string {
  const t = r.totals;
  const lines = [
    '## Supabase Lite conformance',
    '',
    `Mode: **${r.meta.mode}**. ${r.cases.length} cases.`,
    '',
    '| Verdict | Meaning | Cases |',
    '|---|---|---:|',
    `| pass | identical after normalization | ${t.pass} |`,
    ...(['S1', 'S2', 'S3', 'bug', 'S4'] as const).map((s) => `| ${s} | ${SEVERITY[s].title} | ${t[s]} |`),
    ...(t['kit-error'] ? [`| kit-error | case broken on the reference side | ${t['kit-error']} |`] : []),
    ...(t.unverified ? [`| unverified | no reference run | ${t.unverified} |`] : []),
    '',
    ...(r.rootCauseTotals.failing
      ? [
          `**${r.rootCauseTotals.failing} failing cases trace to ${r.rootCauseTotals.distinct} distinct root causes**` +
            (r.rootCauseTotals.unattributed ? ` (${r.rootCauseTotals.unattributed} failing cases unattributed).` : '.'),
          '',
          '| Root cause | Cases |',
          '|---|---|',
          ...Object.entries(r.meta.rootCauses).map(
            ([id, rc]) => `| ${rc.title} | ${r.cases.filter((c) => isFailing(c.verdict) && c.rootCauses.includes(id)).map((c) => `\`${c.id}\` (${c.verdict})`).join(', ')} |`,
          ),
          '',
        ]
      : []),
    '| Case | Verdict | First difference |',
    '|---|---|---|',
    ...r.cases
      .filter((c) => c.verdict !== 'pass')
      .map((c) => {
        const d = c.differences[0];
        const first = d ? `\`${d.path}\`: \`${short(d.reference)}\` → \`${short(d.target)}\`` : '';
        return `| \`${c.id}\` | ${c.verdict} | ${first.replace(/\|/g, '\\|')} |`;
      }),
    '',
    '| Component | Version |',
    '|---|---|',
    ...Object.entries(r.meta.versions).map(([k, v]) => `| ${k} | \`${v}\` |`),
    '',
  ];
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
