/**
 * Root causes behind failing cases, so the report can say "N distinct problems"
 * instead of counting every case that trips over the same one.
 *
 * Cases reference these ids with `rootCause`. The attribution was made by reading
 * the pinned target (supabase-lite @ bf041d0); the report shows it only for cases
 * that actually fail, and lists failing cases without one as "unattributed".
 */
export interface SourceRef {
  /** e.g. "PostgREST (Haskell) · SqlFragment.hs:432" */
  readonly label: string;
  readonly url: string;
}

export interface RootCause {
  readonly title: string;
  readonly detail: string;
  /**
   * Where the reference stack implements the correct behavior, pinned to the versions the
   * kit tests against (PostgREST v16.4, GoTrue v2.197.0). Explained in docs/reference-sources.md.
   */
  readonly reference?: readonly SourceRef[];
}

const PGRST = 'https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/';
const GOTRUE = 'https://github.com/supabase/auth/blob/v2.197.0/';
const hs = (file: string, lines: string): SourceRef => ({
  label: `PostgREST (Haskell) · ${file.split('/').pop()}:${lines}`,
  url: `${PGRST}${file}#L${lines.replace('-', '-L')}`,
});
const go = (file: string, lines: string): SourceRef => ({
  label: `GoTrue (Go) · ${file.split('/').pop()}:${lines}`,
  url: `${GOTRUE}${file}#L${lines.replace('-', '-L')}`,
});

export const ROOT_CAUSES = {
  'like-case-insensitive': {
    title: 'LIKE is case-insensitive',
    detail: "`like` is compiled to SQLite LIKE, which ignores ASCII case. Postgres LIKE is case-sensitive.",
    reference: [hs('Query/SqlFragment.hs', '432-433'), hs('Query/SqlFragment.hs', '458')],
  },
  'ilike-ascii-only': {
    title: 'ILIKE folds only ASCII case',
    detail: 'SQLite case folding covers A–Z only, so É/é, Ü/ü never match each other.',
    reference: [hs('Query/SqlFragment.hs', '149-150')],
  },
  'null-ordering': {
    title: 'NULL sort position differs',
    detail: 'SQLite sorts NULL as the smallest value. Postgres puts NULL last for ASC and first for DESC; the query needs an explicit NULLS LAST/FIRST.',
    reference: [hs('Query/SqlFragment.hs', '389-408'), hs('ApiRequest/QueryParams.hs', '826-833')],
  },
  'binary-collation': {
    title: 'Text sorts by byte order',
    detail: 'SQLite uses BINARY collation; the Supabase database sorts linguistically (alice, Alice, ALICE, …).',
  },
  'boolean-as-integer': {
    title: 'Booleans are stored and returned as 0/1',
    detail: 'No boolean conversion layer: reads return 1/0, `eq.true` compares against the text "true" and matches nothing, and writing a JSON boolean fails to bind in better-sqlite3.',
    reference: [hs('Query/SqlFragment.hs', '429'), hs('Query/SqlFragment.hs', '582-583')],
  },
  'timestamps-not-normalized': {
    title: 'timestamptz is returned as written',
    detail: 'Postgres normalizes to ISO 8601 UTC (2024-01-15T10:30:00+00:00); SQLite returns the inserted text.',
  },
  'no-input-type-validation': {
    title: 'Values are not checked against column types',
    detail: 'SQLite type affinity accepts any value in any column, and filter values are not cast. Postgres rejects them (22P02, 22008, 22001), so the data cannot move to Supabase.',
    reference: [hs('Query/SqlFragment.hs', '429'), hs('Error.hs', '597')],
  },
  'error-codes-not-mapped': {
    title: 'Errors use QUERY_ERROR instead of SQLSTATE / PGRST codes',
    detail: 'SQLite errors are passed through with code QUERY_ERROR (or TABLE_NOT_FOUND) and status 400; PostgREST returns 42703, 23502, 23505 (409), PGRST100, PGRST205.',
    reference: [hs('Error.hs', '541-597'), hs('Error.hs', '146'), hs('Error.hs', '232-242')],
  },
  'partial-content-status': {
    title: 'Partial pages return 200, not 206',
    detail: 'PostgREST answers a ranged request with a count with 206 Partial Content.',
    reference: [hs('RangeQuery.hs', '96-110')],
  },
  'write-projection-ignored': {
    title: '`select=` is ignored on insert/update/delete',
    detail: 'Writes always return every column, whatever the select list asks for.',
  },
  'write-prefer-ignored': {
    title: '`Prefer` is ignored on writes',
    detail: 'return=minimal still returns rows, count=exact on DELETE returns no count, and single() on a write returns an array.',
  },
  'rls-check-reports-success': {
    title: 'RLS WITH CHECK violations are reported as success',
    detail: 'Lite inserts the row, checks it against the policy, deletes it if it fails, and answers 201 with []. Postgres rejects the statement with 42501. The row exists briefly, uses up an id and fires constraints (src/rls/ast-enforcer.ts, validateWithCheck).',
    reference: [hs('Error.hs', '591')],
  },
  'upsert-not-implemented': {
    title: 'Upsert is not implemented',
    detail: 'Listed as missing in Lite docs/api-gap-analysis.md; the request runs as a plain INSERT and hits the UNIQUE constraint.',
  },
  'nested-embedding-broken': {
    title: 'Two-level embedding fails',
    detail: 'authors → posts → comments fails with a raw SQL error (no such column: posts.id), although Lite\'s README lists nested embedding as supported.',
  },
  'inner-hint-misparsed': {
    title: '`!inner` is read as a foreign-key name',
    detail: 'Lite lists !inner as unsupported (src/errors/index.ts) but the select parser treats it as a foreign-key hint first, so the user gets "No foreign key relationship ... using foreign key \'inner\'" instead of the unsupported-feature error.',
  },
  'json-path-select': {
    title: 'JSON paths in select (`->>`) fail to parse',
    detail: 'Rejected as "Invalid column specification"; not listed as unsupported.',
  },
  'select-casts': {
    title: 'Casts in select (`::text`) fail to parse',
    detail: 'Rejected as "Invalid column specification"; not listed as unsupported.',
  },
  'json-contains-unsupported': {
    title: 'Containment operator `cs` is unsupported',
    detail: 'Declared unsupported by Lite (UnsupportedFeatureError).',
  },
  'fts-unsupported': {
    title: 'Full-text search is unsupported',
    detail: 'Declared unsupported by Lite (UnsupportedFeatureError).',
  },
  'no-refresh-tokens': {
    title: 'No refresh tokens',
    detail: 'The refresh_token field is the access token, and grant_type=refresh_token is rejected, so supabase-js cannot keep a session alive past expires_in.',
    reference: [go('internal/models/refresh_token.go', '175-178'), go('internal/models/refresh_token.go', '67')],
  },
  'gotrue-error-format': {
    title: 'Auth errors lack GoTrue error codes and statuses',
    detail: 'Errors carry no error_code (user_already_exists, invalid_credentials, weak_password, session_not_found), and some statuses differ (500 for a weak password).',
    reference: [go('internal/api/apierrors/errorcode.go', '20-103'), go('internal/api/signup.go', '294'), go('internal/api/token.go', '111'), go('internal/api/auth.go', '155'), go('internal/api/errors.go', '121-125')],
  },
  'gotrue-user-shape': {
    title: 'Auth user object is missing GoTrue fields',
    detail: 'No email_confirmed_at, phone, is_anonymous, populated identities or app_metadata.provider.',
    reference: [go('internal/models/user.go', '25-74')],
  },
} as const satisfies Record<string, RootCause>;

export type RootCauseId = keyof typeof ROOT_CAUSES;
