import { defineCase } from '../src/defineCase.ts';
import { ALICE, DOCS, shape } from './_helpers.ts';

const JWT = /^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+$/;

defineCase({
  id: 'auth.signup.session-shape',
  category: 'auth',
  why: 'signUp returns a session and a user with the GoTrue field set.',
  docs: DOCS.auth,
  run: async (sb, ctx) => {
    const { data, error } = await sb.auth.signUp({ email: `shape-${ctx.runId}@example.com`, password: 'password123' });
    return { data: { session: shape(data.session), user: shape(data.user) }, error };
  },
});

defineCase({
  id: 'auth.signup.refresh-token',
  category: 'auth',
  why: 'GoTrue issues a separate, opaque refresh token; it is never the access token.',
  docs: DOCS.auth,
  severity: 'S2',
  run: async (sb, ctx) => {
    const { data, error } = await sb.auth.signUp({ email: `rt-${ctx.runId}@example.com`, password: 'password123' });
    const s = data.session;
    return {
      data: s && {
        refreshDiffersFromAccess: s.refresh_token !== s.access_token,
        refreshIsJwt: JWT.test(s.refresh_token),
        tokenType: s.token_type,
      },
      error,
    };
  },
});

defineCase({
  id: 'auth.signup.duplicate-email',
  category: 'auth',
  why: 'Signing up an existing email (confirmations off): 422, user_already_exists.',
  docs: DOCS.authErrors,
  run: async (sb) => {
    const { data, error } = await sb.auth.signUp({ email: ALICE.email, password: 'another-password' });
    return { data: { session: !!data.session }, error };
  },
});

defineCase({
  id: 'auth.signup.weak-password',
  category: 'auth',
  why: 'A password below the minimum length: 422, weak_password.',
  docs: DOCS.authErrors,
  run: async (sb, ctx) => {
    const { data, error } = await sb.auth.signUp({ email: `weak-${ctx.runId}@example.com`, password: '123' });
    return { data: { session: !!data.session }, error };
  },
});

defineCase({
  id: 'auth.signin.password',
  category: 'auth',
  why: 'signInWithPassword returns the seeded user and a bearer session.',
  docs: DOCS.auth,
  run: async (sb) => {
    const { data, error } = await sb.auth.signInWithPassword(ALICE);
    return {
      data: {
        id: data.user?.id ?? null,
        email: data.user?.email ?? null,
        role: data.user?.role ?? null,
        aud: data.user?.aud ?? null,
        tokenType: data.session?.token_type ?? null,
        expiresIn: data.session?.expires_in ?? null,
      },
      error,
    };
  },
});

defineCase({
  id: 'auth.signin.wrong-password',
  category: 'auth',
  why: 'Wrong password: 400, invalid_credentials.',
  docs: DOCS.authErrors,
  run: async (sb) => {
    const { data, error } = await sb.auth.signInWithPassword({ email: ALICE.email, password: 'wrong-password' });
    return { data: { session: !!data.session }, error };
  },
});

defineCase({
  id: 'auth.refresh-session',
  category: 'auth',
  why: 'Exchanging the refresh token for a new session (grant_type=refresh_token).',
  docs: DOCS.auth,
  run: async (sb) => {
    const signIn = await sb.auth.signInWithPassword(ALICE);
    if (signIn.error) throw signIn.error;
    const { data, error } = await sb.auth.refreshSession({ refresh_token: signIn.data.session!.refresh_token });
    return { data: { session: !!data.session, userId: data.user?.id ?? null }, error };
  },
});

defineCase({
  id: 'auth.get-user',
  category: 'auth',
  why: 'getUser() with a valid session returns the same user.',
  docs: DOCS.auth,
  run: async (sb, ctx) => {
    const client = await ctx.signedIn(ALICE.email, ALICE.password);
    const { data, error } = await client.auth.getUser();
    return { data: { id: data.user?.id ?? null, email: data.user?.email ?? null }, error };
  },
});

defineCase({
  id: 'auth.signout.revokes-session',
  category: 'auth',
  why: 'After signOut(), the old access token no longer gets a user (session revoked).',
  docs: DOCS.auth,
  run: async (sb, ctx) => {
    const client = await ctx.signedIn(ALICE.email, ALICE.password);
    const token = (await client.auth.getSession()).data.session!.access_token;
    const out = await client.auth.signOut();
    if (out.error) return { data: { signedOut: false }, error: out.error };
    const { data, error } = await ctx.client().auth.getUser(token);
    return { data: { user: !!data.user }, error };
  },
});
