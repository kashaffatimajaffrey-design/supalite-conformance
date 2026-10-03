/**
 * Boots the pinned Supabase Lite server as the TARGET:
 * in-memory SQLite, auth + GoTrue endpoints + RLS on, schema and seed loaded,
 * listening on LITE_PORT (default 54400).
 *
 *   npm run lite
 *
 * Lite's own dependencies (better-sqlite3, hono, bcryptjs) are resolved from the
 * submodule's node_modules so only one copy of the native module exists.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { LITE_JWT_SECRET, LITE_PORT, signAnonKey } from './config.ts';
import { insertsFor, seed } from '../fixtures/gen-seed.ts';
import { litePolicies } from '../fixtures/policies.lite.ts';
import { isMain } from '../src/isMain.ts';

const LITE = new URL('./supabase-lite/', import.meta.url);
const liteRequire = createRequire(new URL('package.json', LITE));
const liteSrc = (p: string) => import(new URL(`src/${p}`, LITE).href);

const Database = liteRequire('better-sqlite3');
const bcrypt = liteRequire('bcryptjs');
const { serve } = liteRequire('@hono/node-server');
const { createServer } = await liteSrc('api/server.ts');
const { SqliteAdapter } = await liteSrc('database/sqlite-adapter.ts');
const { SqliteRLSProvider } = await liteSrc('rls/storage.ts');
const { SqliteAuthProvider } = await liteSrc('auth/provider.ts');
const { policy } = await liteSrc('rls/policy-builder.ts');

export async function bootLite(port = LITE_PORT) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  // Create auth tables first (createServer would also do this), then seed users with fixed ids.
  new SqliteAuthProvider(db, { jwtSecret: LITE_JWT_SECRET });
  const now = new Date().toISOString();
  const addUser = db.prepare(
    'INSERT INTO auth_users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  for (const u of seed.users) addUser.run(u.id, u.email, bcrypt.hashSync(u.password, 10), now, now);

  db.exec(readFileSync(fileURLToPath(new URL('../fixtures/schema.sqlite.sql', import.meta.url)), 'utf8'));
  db.exec(insertsFor('sqlite'));

  const rls = new SqliteRLSProvider(db);
  const { enable, policies } = litePolicies(policy);
  for (const t of enable) await rls.enableRLS(t);
  for (const p of policies) await rls.createPolicy(p);

  const anonKey = signAnonKey(LITE_JWT_SECRET);
  const app = createServer({
    db: new SqliteAdapter(db),
    auth: { enabled: true, jwtSecret: LITE_JWT_SECRET, anonKey, goTrue: true },
    rls: { enabled: true },
  });
  const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' });
  return { server, db, anonKey, url: `http://127.0.0.1:${port}` };
}

if (isMain(import.meta.url)) {
  const { url, anonKey } = await bootLite();
  const commit = (() => {
    try {
      return readFileSync(fileURLToPath(new URL('../.git/modules/targets/supabase-lite/HEAD', import.meta.url)), 'utf8').trim();
    } catch {
      return 'unknown';
    }
  })();
  console.log(`Supabase Lite (${commit.slice(0, 7)}) listening on ${url}`);
  console.log(`TARGET_URL=${url}`);
  console.log(`TARGET_KEY=${anonKey}`);
}
