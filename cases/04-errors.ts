import { defineCase } from '../src/defineCase.ts';
import { DOCS } from './_helpers.ts';

defineCase({
  id: 'errors.single.zero-rows',
  category: 'errors',
  why: '`single()` with no match: 406, PGRST116.',
  docs: DOCS.errors,
  run: (sb) => sb.from('people').select('id').eq('id', 99).single(),
});

defineCase({
  id: 'errors.single.many-rows',
  category: 'errors',
  why: '`single()` with several matches: 406, PGRST116.',
  docs: DOCS.errors,
  run: (sb) => sb.from('people').select('id').lt('id', 3).single(),
});

defineCase({
  id: 'errors.maybe-single.zero-rows',
  category: 'errors',
  why: '`maybeSingle()` with no match is not an error: data is null.',
  docs: DOCS.errors,
  run: (sb) => sb.from('people').select('id').eq('id', 99).maybeSingle(),
});

defineCase({
  id: 'errors.unknown-column.select',
  category: 'errors',
  why: 'Selecting a missing column: 400 with Postgres code 42703.',
  docs: DOCS.errors,
  run: (sb) => sb.from('people').select('nope'),
});

defineCase({
  id: 'errors.unknown-column.filter',
  category: 'errors',
  why: 'Filtering on a missing column: 400 with Postgres code 42703.',
  docs: DOCS.errors,
  run: (sb) => sb.from('people').select('id').eq('nope', 1),
});

defineCase({
  id: 'errors.unknown-table',
  category: 'errors',
  why: 'A missing table: 404 with PostgREST code PGRST205.',
  docs: DOCS.errors,
  run: (sb) => sb.from('nope').select('*'),
});

defineCase({
  id: 'errors.invalid-integer.eq',
  category: 'errors',
  why: 'eq on an integer column with a non-integer: 400, 22P02.',
  docs: DOCS.pgErrors,
  run: (sb) => sb.from('people').select('id').eq('id', 'abc'),
});

defineCase({
  id: 'errors.malformed-or',
  category: 'errors',
  why: 'An `or` filter the parser cannot read: 400, PGRST100.',
  docs: DOCS.errors,
  run: (sb) => sb.from('people').select('id').or('id.eq'),
});

defineCase({
  id: 'errors.not-null-violation',
  category: 'errors',
  why: 'Inserting without a NOT NULL column: 400, 23502.',
  docs: DOCS.pgErrors,
  run: (sb) => sb.from('scratch').insert({ qty: 1 }),
});

defineCase({
  id: 'errors.unique-violation',
  category: 'errors',
  why: 'Inserting a duplicate into a UNIQUE column: 409 Conflict, 23505.',
  docs: DOCS.pgErrors,
  setup: (sb, ctx) => sb.from('scratch').insert({ label: `${ctx.runId}-dup` }).throwOnError(),
  run: (sb, ctx) => sb.from('scratch').insert({ label: `${ctx.runId}-dup` }),
  teardown: (sb, ctx) => sb.from('scratch').delete().eq('label', `${ctx.runId}-dup`),
});
