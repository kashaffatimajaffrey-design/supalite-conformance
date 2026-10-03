/**
 * Lite equivalent of the RLS section of schema.pg.sql.
 *
 * Lite stores policies as a filter AST built with its policy() helpers, not SQL,
 * so they live here. Only `notes` gets RLS: on Lite a table without RLS is open,
 * which matches the permissive policies Postgres has on the other tables.
 */
type PolicyApi = {
  eq: (col: string, v: unknown) => unknown;
  or: (...n: unknown[]) => unknown;
  authUid: () => unknown;
  alwaysAllow: () => unknown;
};

export function litePolicies(p: PolicyApi) {
  const own = p.eq('owner_id', p.authUid());
  return {
    enable: ['notes'],
    policies: [
      { name: 'notes_anon_read', tableName: 'notes', command: 'SELECT', role: 'anon', using: p.eq('is_public', 1) },
      { name: 'notes_auth_read', tableName: 'notes', command: 'SELECT', role: 'authenticated', using: p.or(p.eq('is_public', 1), own) },
      { name: 'notes_auth_insert', tableName: 'notes', command: 'INSERT', role: 'authenticated', withCheck: own },
      { name: 'notes_auth_update', tableName: 'notes', command: 'UPDATE', role: 'authenticated', using: own, withCheck: own },
      { name: 'notes_auth_delete', tableName: 'notes', command: 'DELETE', role: 'authenticated', using: own },
    ],
  } as const;
}
