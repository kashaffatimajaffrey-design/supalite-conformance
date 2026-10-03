import { defineCase } from '../src/defineCase.ts';
import { DOCS } from './_helpers.ts';

defineCase({
  id: 'ordering.nulls.asc-default',
  category: 'ordering',
  rootCause: 'null-ordering',
  why: 'Postgres sorts NULL last for ASC; SQLite sorts NULL first.',
  docs: DOCS.nulls,
  run: (sb) => sb.from('people').select('id,score').order('score', { ascending: true }).order('id'),
});

defineCase({
  id: 'ordering.nulls.desc-default',
  category: 'ordering',
  rootCause: 'null-ordering',
  why: 'Postgres sorts NULL first for DESC; SQLite sorts NULL last.',
  docs: DOCS.nulls,
  run: (sb) => sb.from('people').select('id,score').order('score', { ascending: false }).order('id'),
});

defineCase({
  id: 'ordering.nulls.explicit-first',
  category: 'ordering',
  why: '`nullsfirst` must be honored when given explicitly.',
  docs: DOCS.ordering,
  run: (sb) =>
    sb.from('people').select('id,score').order('score', { ascending: true, nullsFirst: true }).order('id'),
});

defineCase({
  id: 'ordering.text.collation',
  category: 'ordering',
  rootCause: 'binary-collation',
  why: 'Text order depends on collation: mixed case and accented names.',
  docs: DOCS.ordering,
  run: (sb) => sb.from('people').select('name').order('name').order('id'),
});

defineCase({
  id: 'ordering.boolean',
  category: 'ordering',
  why: 'false sorts before true in Postgres; 0 before 1 in SQLite.',
  docs: DOCS.ordering,
  run: (sb) => sb.from('people').select('id').order('active').order('id'),
});

defineCase({
  id: 'ordering.range',
  category: 'ordering',
  why: '`range(2, 4)` maps to offset 2, limit 3.',
  docs: DOCS.pagination,
  run: (sb) => sb.from('people').select('id').order('id').range(2, 4),
});

defineCase({
  id: 'ordering.limit-desc',
  category: 'ordering',
  why: '`limit` combined with a descending order.',
  docs: DOCS.pagination,
  run: (sb) => sb.from('people').select('id').order('id', { ascending: false }).limit(3),
});

defineCase({
  id: 'ordering.count.exact-head',
  category: 'ordering',
  why: "`count: 'exact', head: true` returns only the count.",
  docs: DOCS.pagination,
  run: (sb) => sb.from('people').select('*', { count: 'exact', head: true }),
});

defineCase({
  id: 'ordering.count.exact-with-range',
  category: 'ordering',
  rootCause: 'partial-content-status',
  why: 'PostgREST answers a partial page with 206 Partial Content and the total count.',
  docs: DOCS.pagination,
  run: (sb) => sb.from('people').select('id', { count: 'exact' }).gt('score', 4).order('id').range(0, 1),
});
