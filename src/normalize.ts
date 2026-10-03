/**
 * Turns whatever a case returned into a plain JSON value that can be compared
 * across backends:
 *
 * - supabase-js responses keep only status, data, count and error.{code}
 *   (errors are compared by status + code, never by message text);
 * - JWTs become "<jwt>", and uuids that are not part of the seed become "<uuid>";
 * - paths listed in a case's `ignore` become "<ignored>".
 *
 * Timestamps are deliberately NOT stripped globally: their format is one of the
 * things under test. Cases that read generated timestamps list them in `ignore`.
 */
import { seed } from '../fixtures/gen-seed.ts';

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface Outcome {
  /** What gets compared. */
  readonly compared: Json;
  /** Same, plus error messages and HTTP status text, for humans reading the report. */
  readonly display: Json;
  readonly isError: boolean;
  readonly thrown: boolean;
  /** The error message says the feature is not supported (e.g. Lite's UnsupportedFeatureError). */
  readonly declaresUnsupported: boolean;
}

const UNSUPPORTED = /\bnot (yet )?(supported|implemented)\b|\bunsupported\b|\bonly .+ (is|are) supported\b/i;

const JWT = /^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEED_UUIDS = new Set<string>();
(function collect(v: unknown) {
  if (typeof v === 'string' && UUID.test(v)) SEED_UUIDS.add(v.toLowerCase());
  else if (v && typeof v === 'object') Object.values(v).forEach(collect);
})(seed);

function toJson(v: unknown, seen = new WeakSet<object>()): Json {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    if (JWT.test(v)) return '<jwt>';
    if (UUID.test(v) && !SEED_UUIDS.has(v.toLowerCase())) return '<uuid>';
    return v;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (seen.has(v)) return '<circular>';
    seen.add(v);
    if (Array.isArray(v)) return v.map((x) => toJson(x, seen));
    const out: Record<string, Json> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x !== 'function' && x !== undefined) out[k] = toJson(x, seen);
    }
    return out;
  }
  return String(v);
}

function isPostgrestResponse(r: any): boolean {
  return r && typeof r === 'object' && 'data' in r && 'error' in r && 'status' in r && 'statusText' in r;
}
function isAuthResponse(r: any): boolean {
  return r && typeof r === 'object' && 'data' in r && 'error' in r && Object.keys(r).length === 2;
}

function errorParts(e: any): { compared: Json; display: Json } {
  const compared: Record<string, Json> = { code: e?.code ?? null };
  if (typeof e?.status === 'number') compared.status = e.status;
  return { compared, display: { ...compared, message: e?.message ?? String(e), ...(e?.details ? { details: e.details } : {}), ...(e?.hint ? { hint: e.hint } : {}) } };
}

export function normalize(result: unknown, ignore: readonly string[] = []): Outcome {
  let compared: Json;
  let display: Json;
  let isError = false;

  if (isPostgrestResponse(result)) {
    const r = result as any;
    const err = r.error ? errorParts(r.error) : null;
    isError = !!r.error;
    compared = { status: r.status, data: toJson(r.data), count: r.count ?? null, error: err?.compared ?? null };
    display = { ...compared, statusText: r.statusText ?? null, error: err?.display ?? null };
  } else if (isAuthResponse(result)) {
    const r = result as any;
    const err = r.error ? errorParts(r.error) : null;
    isError = !!r.error;
    compared = { data: toJson(r.data), error: err?.compared ?? null };
    display = { ...compared, error: err?.display ?? null };
  } else {
    compared = { value: toJson(result) };
    display = compared;
  }

  for (const p of ignore) {
    compared = applyIgnore(compared, parsePath(p));
    display = applyIgnore(display, parsePath(p));
  }
  const message = isError ? String((result as any)?.error?.message ?? '') : '';
  return { compared, display, isError, thrown: false, declaresUnsupported: UNSUPPORTED.test(message) };
}

export function normalizeThrown(e: unknown): Outcome {
  const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return { compared: { thrown: true }, display: { thrown: message }, isError: true, thrown: true, declaresUnsupported: false };
}

/** `data[*].created_at` → ['data', '*', 'created_at'] */
export function parsePath(p: string): string[] {
  return p
    .replace(/\[(\*|\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
}

function applyIgnore(v: Json, path: string[]): Json {
  if (path.length === 0) return '<ignored>';
  const [head, ...rest] = path as [string, ...string[]];
  if (Array.isArray(v)) {
    if (head === '*') return v.map((x) => applyIgnore(x, rest));
    const i = Number(head);
    if (!Number.isInteger(i) || i >= v.length) return v;
    return v.map((x, j) => (j === i ? applyIgnore(x, rest) : x));
  }
  if (v && typeof v === 'object') {
    if (head === '*') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, applyIgnore(x, rest)]));
    if (!(head in v)) return v;
    return { ...v, [head]: applyIgnore(v[head]!, rest) };
  }
  return v;
}

export interface Difference {
  readonly path: string;
  readonly reference: Json | undefined;
  readonly target: Json | undefined;
}

/** Structural diff of two normalized values. `undefined` means "key absent". */
export function diff(a: Json | undefined, b: Json | undefined, path = ''): Difference[] {
  if (a === b) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: Difference[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...diff(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  if (isObj(a) && isObj(b)) {
    const out: Difference[] = [];
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      out.push(...diff(a[k], b[k], path ? `${path}.${k}` : k));
    }
    return out;
  }
  return [{ path: path || '(root)', reference: a, target: b }];
}

const isObj = (v: unknown): v is { [k: string]: Json } => !!v && typeof v === 'object' && !Array.isArray(v);
