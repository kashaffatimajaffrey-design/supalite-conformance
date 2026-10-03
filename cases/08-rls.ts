import { defineCase } from '../src/defineCase.ts';
import { ALICE, BOB, DOCS } from './_helpers.ts';

// Policies (schema.pg.sql / policies.lite.ts): anon sees public notes; a signed-in
// user sees public notes plus their own, and may only write their own.

defineCase({
  id: 'rls.anon.select',
  category: 'rls',
  why: 'Anon only sees rows where is_public is true.',
  docs: DOCS.rls,
  run: (sb) => sb.from('notes').select('id,body').order('id'),
});

defineCase({
  id: 'rls.user.select',
  category: 'rls',
  why: 'A signed-in user sees public rows plus their own.',
  docs: DOCS.rls,
  run: async (_sb, ctx) => (await ctx.signedIn(ALICE.email, ALICE.password)).from('notes').select('id,body').order('id'),
});

defineCase({
  id: 'rls.anon.insert-denied',
  category: 'rls',
  why: 'Anon has no INSERT policy: 401, 42501.',
  docs: DOCS.rls,
  run: (sb, ctx) => sb.from('notes').insert({ owner_id: ALICE.id, body: `anon-${ctx.runId}` }),
});

defineCase({
  id: 'rls.user.insert-own',
  category: 'rls',
  why: 'WITH CHECK passes when owner_id = auth.uid().',
  docs: DOCS.rls,
  run: async (_sb, ctx) =>
    (await ctx.signedIn(ALICE.email, ALICE.password))
      .from('notes')
      .insert({ owner_id: ALICE.id, body: `own-${ctx.runId}` })
      .select('owner_id,is_public'),
  teardown: async (_sb, ctx) =>
    (await ctx.signedIn(ALICE.email, ALICE.password)).from('notes').delete().eq('body', `own-${ctx.runId}`),
});

defineCase({
  id: 'rls.user.insert-other-owner',
  category: 'rls',
  why: 'WITH CHECK fails when owner_id is someone else: 403, 42501.',
  docs: DOCS.rls,
  run: async (_sb, ctx) =>
    (await ctx.signedIn(ALICE.email, ALICE.password))
      .from('notes')
      .insert({ owner_id: BOB.id, body: `forged-${ctx.runId}` })
      .select('id'),
});

defineCase({
  id: 'rls.user.update-others-row',
  category: 'rls',
  why: "Updating another user's visible row matches zero rows under USING: empty result, no error.",
  docs: DOCS.rls,
  run: async (_sb, ctx) =>
    (await ctx.signedIn(ALICE.email, ALICE.password))
      .from('notes')
      .update({ body: 'hijacked' })
      .eq('id', 3)
      .select('id,body'),
});
