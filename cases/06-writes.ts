import { defineCase } from '../src/defineCase.ts';
import { DOCS, shape } from './_helpers.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaseContext } from '../src/defineCase.ts';

// Every write case uses labels prefixed with the run id and removes them afterwards.
const label = (ctx: CaseContext, s: string) => `${ctx.runId}-${s}`;
const cleanup = (sb: SupabaseClient, ctx: CaseContext) => sb.from('scratch').delete().like('label', `${ctx.runId}-%`);

defineCase({
  id: 'writes.insert.returning',
  category: 'writes',
  why: 'Insert + select returns the new row with defaults filled in, status 201.',
  docs: DOCS.writes,
  run: (sb, ctx) => sb.from('scratch').insert({ label: label(ctx, 'a'), qty: 1 }).select('label,qty,done,due'),
  ignore: ['data[*].label'],
  teardown: cleanup,
});

defineCase({
  id: 'writes.insert.minimal',
  category: 'writes',
  why: 'Insert without select returns no body (return=minimal), status 201.',
  docs: DOCS.writes,
  run: (sb, ctx) => sb.from('scratch').insert({ label: label(ctx, 'min'), qty: 1 }),
  teardown: cleanup,
});

defineCase({
  id: 'writes.insert.bulk',
  category: 'writes',
  why: 'Bulk insert returns all rows in insertion order.',
  docs: DOCS.writes,
  run: (sb, ctx) =>
    sb
      .from('scratch')
      .insert([
        { label: label(ctx, 'b1'), qty: 1 },
        { label: label(ctx, 'b2'), qty: 2 },
        { label: label(ctx, 'b3'), qty: 3 },
      ])
      .select('qty'),
  teardown: cleanup,
});

defineCase({
  id: 'writes.insert.generated-id',
  category: 'writes',
  why: 'The generated primary key is returned as a JSON number.',
  docs: DOCS.writes,
  run: async (sb, ctx) => {
    const r = await sb.from('scratch').insert({ label: label(ctx, 'gid') }).select('id').single();
    return { ...r, data: shape(r.data) };
  },
  teardown: cleanup,
});

defineCase({
  id: 'writes.update.returning',
  category: 'writes',
  why: 'Update + select returns the changed rows, status 200.',
  docs: DOCS.writes,
  setup: (sb, ctx) => sb.from('scratch').insert({ label: label(ctx, 'u'), qty: 1 }).throwOnError(),
  run: (sb, ctx) => sb.from('scratch').update({ qty: 5 }).eq('label', label(ctx, 'u')).select('qty'),
  teardown: cleanup,
});

defineCase({
  id: 'writes.boolean-value',
  category: 'writes',
  why: 'Writing a JSON boolean into a boolean column.',
  docs: DOCS.writes,
  setup: (sb, ctx) => sb.from('scratch').insert({ label: label(ctx, 'bool') }).throwOnError(),
  run: (sb, ctx) => sb.from('scratch').update({ done: true }).eq('label', label(ctx, 'bool')).select('done'),
  teardown: cleanup,
});

defineCase({
  id: 'writes.update.no-match',
  category: 'writes',
  why: 'Updating zero rows is not an error: empty array.',
  docs: DOCS.writes,
  run: (sb, ctx) => sb.from('scratch').update({ qty: 5 }).eq('label', label(ctx, 'missing')).select('qty'),
});

defineCase({
  id: 'writes.delete.returning',
  category: 'writes',
  why: 'Delete + select returns the deleted rows.',
  docs: DOCS.writes,
  setup: (sb, ctx) => sb.from('scratch').insert({ label: label(ctx, 'd'), qty: 9 }).throwOnError(),
  run: (sb, ctx) => sb.from('scratch').delete().eq('label', label(ctx, 'd')).select('qty'),
  teardown: cleanup,
});

defineCase({
  id: 'writes.delete.count',
  category: 'writes',
  why: "`delete({ count: 'exact' })` reports how many rows were deleted.",
  docs: DOCS.pagination,
  setup: (sb, ctx) =>
    sb.from('scratch').insert([{ label: label(ctx, 'c1') }, { label: label(ctx, 'c2') }]).throwOnError(),
  run: (sb, ctx) => sb.from('scratch').delete({ count: 'exact' }).like('label', `${ctx.runId}-c%`),
  teardown: cleanup,
});

defineCase({
  id: 'writes.upsert.on-conflict',
  category: 'writes',
  why: 'Upsert on a unique column updates the existing row (INSERT ... ON CONFLICT DO UPDATE).',
  docs: DOCS.upsert,
  knownGap: 'Upsert is listed as not implemented in Lite docs/api-gap-analysis.md.',
  setup: (sb, ctx) => sb.from('scratch').insert({ label: label(ctx, 'up'), qty: 1 }).throwOnError(),
  run: (sb, ctx) =>
    sb.from('scratch').upsert({ label: label(ctx, 'up'), qty: 2 }, { onConflict: 'label' }).select('qty'),
  teardown: cleanup,
});
