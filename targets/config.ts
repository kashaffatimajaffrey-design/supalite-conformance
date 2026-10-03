/**
 * Where the two backends live. Everything comes from the environment so the kit
 * stays black-box: point TARGET_URL at any Supabase-compatible server and the
 * same cases run against it.
 *
 *   REFERENCE_URL / REFERENCE_KEY  real Supabase (`supabase start`, Postgres)
 *   TARGET_URL    / TARGET_KEY     the Lite implementation under test
 */
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Load .env (KEY=value lines) without a dependency. Real env vars win.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}

/** Same default secret the Supabase CLI uses locally, so both stacks feel alike. */
export const LITE_JWT_SECRET =
  process.env.LITE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
export const LITE_PORT = Number(process.env.LITE_PORT ?? 54400);

/** HS256 anon key for Lite, signed with node:crypto so the kit needs no JWT library. */
export function signAnonKey(secret: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
    iss: 'supabase-lite',
    role: 'anon',
    iat: 1_700_000_000,
    exp: 2_000_000_000,
  })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export interface Target {
  readonly name: 'reference' | 'target';
  readonly label: string;
  readonly url: string;
  readonly key: string;
}

export function loadTargets(): { reference: Target | null; target: Target } {
  const reference =
    process.env.REFERENCE_URL && process.env.REFERENCE_KEY
      ? {
          name: 'reference' as const,
          label: process.env.REFERENCE_LABEL ?? 'Supabase (Postgres)',
          url: process.env.REFERENCE_URL,
          key: process.env.REFERENCE_KEY,
        }
      : null;
  const target = {
    name: 'target' as const,
    label: process.env.TARGET_LABEL ?? 'Supabase Lite (SQLite)',
    url: process.env.TARGET_URL ?? `http://127.0.0.1:${LITE_PORT}`,
    key: process.env.TARGET_KEY ?? signAnonKey(LITE_JWT_SECRET),
  };
  return { reference, target };
}
