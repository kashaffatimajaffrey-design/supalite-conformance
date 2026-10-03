import type { SupabaseClient } from '@supabase/supabase-js';
import type { Severity } from './classify.ts';

export type Category =
  | 'filters'
  | 'ordering'
  | 'types'
  | 'errors'
  | 'embedding'
  | 'writes'
  | 'auth'
  | 'rls'
  | 'upgrade';

export interface CaseContext {
  /** 'reference' (Postgres) or 'target' (Lite). Cases must not branch on this. */
  readonly side: 'reference' | 'target';
  /** Same on both sides for one run; use it to make unique emails, labels, ... */
  readonly runId: string;
  /** A fresh anon client (no persisted session). */
  client(): SupabaseClient;
  /** A fresh client signed in with email/password. Throws if sign-in fails. */
  signedIn(email: string, password: string): Promise<SupabaseClient>;
}

export interface Case {
  /** Stable dotted id: `<category>.<thing>.<detail>`. */
  readonly id: string;
  readonly category: Category;
  /** One sentence: what Postgres does and why the target might differ. */
  readonly why: string;
  /** Link to the PostgREST / GoTrue / Postgres docs describing the reference behavior. */
  readonly docs?: string;
  /** Runs on each side with a fresh anon client. Return a supabase-js result or any JSON value. */
  readonly run: (sb: SupabaseClient, ctx: CaseContext) => Promise<unknown> | PromiseLike<unknown>;
  /** Runs before `run` on each side (e.g. delete leftovers). Failures abort the case. */
  readonly setup?: (sb: SupabaseClient, ctx: CaseContext) => Promise<unknown> | PromiseLike<unknown>;
  /** Runs after `run` on each side, even if `run` threw. Failures are ignored. */
  readonly teardown?: (sb: SupabaseClient, ctx: CaseContext) => Promise<unknown> | PromiseLike<unknown>;
  /** Paths whose values are generated and must not be compared, e.g. `data[*].created_at`. */
  readonly ignore?: readonly string[];
  /**
   * Severity to use when the sides differ, for probe cases whose return value is a
   * derived fact (e.g. "refresh token differs from access token") where the automatic
   * rules cannot know what the difference means. Omit to classify automatically.
   */
  readonly severity?: Severity;
  /** Documented upstream gap (e.g. on Lite's own "not implemented" list). Shown in the report. */
  readonly knownGap?: string;
}

const registry: Case[] = [];

export function defineCase(c: Case): Case {
  if (registry.some((r) => r.id === c.id)) throw new Error(`duplicate case id: ${c.id}`);
  registry.push(c);
  return c;
}

export function registeredCases(): readonly Case[] {
  return registry;
}
