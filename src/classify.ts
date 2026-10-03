/**
 * pass / S1–S4 / bug. Deterministic: the verdict depends only on the two normalized
 * outcomes and on whether the case documents a known gap.
 *
 *   S1   wrong data, no error     the app silently shows wrong results (worst)
 *   S2   wrong shape or type      same information, different JSON (breaks typed apps)
 *   S3   wrong error format       both fail, but with a different status or code
 *   bug  loud bug                 the target errors where the reference works, and the
 *                                 error does not say the feature is unsupported
 *   S4   clearly unsupported      the target errors and says the feature is unsupported,
 *                                 or the target's own docs list it as not implemented
 *
 * Declared gaps (S4) are acceptable for a lite version. Silent wrong data (S1) is not.
 */
import type { Json, Outcome } from './normalize.ts';
import { diff } from './normalize.ts';

export type Severity = 'S1' | 'S2' | 'S3' | 'bug' | 'S4';
export type Verdict = 'pass' | Severity | 'kit-error';

/** In order of harm. */
export const SEVERITY: Record<Severity, { title: string; meaning: string }> = {
  S1: { title: 'Wrong data, no error', meaning: 'The app silently shows wrong results.' },
  S2: { title: 'Wrong shape or type', meaning: 'Same information, different JSON. Breaks typed apps.' },
  S3: { title: 'Wrong error format', meaning: 'Both fail, with a different status or error code. Breaks error handling.' },
  bug: { title: 'Loud bug', meaning: 'Errors where Postgres works, without saying the feature is unsupported.' },
  S4: { title: 'Clearly unsupported', meaning: 'Errors and says so, or is a documented gap. Acceptable for a lite version.' },
};

export interface ClassifyOptions {
  /** Severity the case sets explicitly (probe cases). */
  readonly severity?: Severity | undefined;
  /** The case documents this as a gap listed in the target's own docs. */
  readonly knownGap?: boolean | undefined;
}

export interface Classification {
  readonly verdict: Verdict;
  readonly reason: string;
}

export function classify(ref: Outcome, tgt: Outcome, opts: ClassifyOptions = {}): Classification {
  if (ref.thrown) return { verdict: 'kit-error', reason: 'The case threw on the reference side; the case itself is broken.' };
  if (diff(ref.compared, tgt.compared).length === 0) return { verdict: 'pass', reason: 'Identical after normalization.' };

  const auto = autoClassify(ref, tgt, !!opts.knownGap);
  if (opts.severity) return { verdict: opts.severity, reason: `${auto.reason} (severity set by the case)` };
  return auto;
}

function autoClassify(ref: Outcome, tgt: Outcome, knownGap: boolean): { verdict: Severity; reason: string } {
  if (!ref.isError && tgt.isError) {
    if (tgt.declaresUnsupported) return { verdict: 'S4', reason: 'The reference succeeded; the target said the feature is not supported.' };
    if (knownGap) return { verdict: 'S4', reason: "The reference succeeded; the target failed on a gap listed in its own docs." };
    return {
      verdict: 'bug',
      reason: tgt.thrown
        ? 'The reference succeeded; supabase-js threw on the target response.'
        : 'The reference succeeded; the target returned an error that does not say the feature is unsupported.',
    };
  }
  if (ref.isError && tgt.isError) return { verdict: 'S3', reason: 'Both returned an error, with a different status or code.' };
  if (ref.isError && !tgt.isError)
    return { verdict: 'S1', reason: 'The reference rejected the request; the target reported success.' };

  const r = ref.compared as Record<string, Json>;
  const t = tgt.compared as Record<string, Json>;
  if ((r.count ?? null) !== (t.count ?? null)) return { verdict: 'S1', reason: 'Different row count.' };
  const body = (o: Record<string, Json>) => ('value' in o ? o.value : o.data);
  if ((body(r) ?? null) === null || (body(t) ?? null) === null) {
    return { verdict: 'S2', reason: 'A response body on one side only (e.g. rows returned where none were asked for).' };
  }
  if (looseEqual(body(r) ?? null, body(t) ?? null)) {
    return { verdict: 'S2', reason: 'Same values, different JSON types, formats, keys or status.' };
  }
  return { verdict: 'S1', reason: 'Different rows or values.' };
}

/**
 * Equal "as information": 1 == true, "4.50" == 4.5, '{"a":1}' == {a:1},
 * "2024-01-15 10:30:00+00" == "2024-01-15T10:30:00+00:00", [x] == x.
 * Keys present on only one side are ignored (that is a shape difference).
 */
export function looseEqual(a: Json | undefined, b: Json | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return true; // missing key: shape, not value
  if (a === null || b === null) return false;

  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const asBool = (v: Json) => (v === 1 || v === '1' || v === true || v === 't' || v === 'true' ? true : v === 0 || v === '0' || v === false || v === 'f' || v === 'false' ? false : undefined);
    return asBool(a) !== undefined && asBool(a) === asBool(b);
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const n = (v: Json) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    return n(a) === n(b);
  }
  if (typeof a === 'string' && typeof b === 'string') {
    const ta = toInstant(a);
    const tb = toInstant(b);
    return ta !== null && ta === tb;
  }
  if (typeof a === 'string' || typeof b === 'string') {
    const [s, o] = typeof a === 'string' ? [a, b] : [b as string, a];
    try {
      return looseEqual(JSON.parse(s), o);
    } catch {
      return false;
    }
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => looseEqual(x, b[i]));
  if (Array.isArray(a) && a.length === 1) return looseEqual(a[0], b);
  if (Array.isArray(b) && b.length === 1) return looseEqual(a, b[0]);
  if (Array.isArray(a) || Array.isArray(b)) return false;
  const keys = Object.keys(a).filter((k) => k in (b as object));
  return keys.every((k) => looseEqual((a as any)[k], (b as any)[k]));
}

/** Parses the timestamp spellings Postgres and SQLite produce; null if not a timestamp. */
export function toInstant(s: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(s.trim());
  if (!m) return null;
  const [, date, time = '00:00:00', zone] = m;
  let z = zone ?? 'Z';
  if (/^[+-]\d{2}$/.test(z)) z += ':00';
  else if (/^[+-]\d{4}$/.test(z)) z = `${z.slice(0, 3)}:${z.slice(3)}`;
  const ms = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time.replace(/(\.\d{3})\d+/, '$1')}${z}`);
  return Number.isNaN(ms) ? null : ms;
}
