/** Small helpers shared by cases. Files starting with "_" are not cases. */

export const DOCS = {
  operators: 'https://docs.postgrest.org/en/stable/references/api/tables_views.html#operators',
  ordering: 'https://docs.postgrest.org/en/stable/references/api/tables_views.html#ordering',
  pagination: 'https://docs.postgrest.org/en/stable/references/api/pagination_count.html',
  embedding: 'https://docs.postgrest.org/en/stable/references/api/resource_embedding.html',
  errors: 'https://docs.postgrest.org/en/stable/references/errors.html',
  pgErrors: 'https://www.postgresql.org/docs/current/errcodes-appendix.html',
  writes: 'https://docs.postgrest.org/en/stable/references/api/tables_views.html#insert',
  upsert: 'https://docs.postgrest.org/en/stable/references/api/tables_views.html#upsert',
  json: 'https://docs.postgrest.org/en/stable/references/api/tables_views.html#json-columns',
  fts: 'https://docs.postgrest.org/en/stable/references/api/tables_views.html#full-text-search',
  types: 'https://www.postgresql.org/docs/current/datatype.html',
  like: 'https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE',
  nulls: 'https://www.postgresql.org/docs/current/queries-order.html',
  auth: 'https://supabase.com/docs/reference/javascript/auth-signup',
  authErrors: 'https://supabase.com/docs/guides/auth/debugging/error-codes',
  rls: 'https://supabase.com/docs/guides/database/postgres/row-level-security',
} as const;

export const ALICE = { email: 'alice@example.com', password: 'password123', id: '11111111-1111-4111-8111-111111111111' };
export const BOB = { email: 'bob@example.com', password: 'password123', id: '22222222-2222-4222-8222-222222222222' };

/** Replace every value by its JSON type, so two objects can be compared by shape. */
export function shape(v: unknown): unknown {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return v.length ? [shape(v[0])] : [];
  if (typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape((v as Record<string, unknown>)[k])]));
  }
  return typeof v;
}

/** Reduce an auth-js error to what is compared (status + code). */
export function authError(e: { status?: number; code?: string } | null | undefined) {
  return e ? { status: e.status ?? null, code: e.code ?? null } : null;
}
