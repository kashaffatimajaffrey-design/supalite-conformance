import { defineCase } from '../src/defineCase.ts';
import { DOCS } from './_helpers.ts';

defineCase({
  id: 'filters.like.case-sensitive',
  category: 'filters',
  why: 'Postgres LIKE is case-sensitive; SQLite LIKE ignores ASCII case.',
  docs: DOCS.like,
  run: (sb) => sb.from('people').select('id,name').like('name', 'Al%').order('id'),
});

defineCase({
  id: 'filters.like.underscore',
  category: 'filters',
  why: '`_` matches exactly one character in both databases.',
  docs: DOCS.like,
  run: (sb) => sb.from('people').select('id,name').like('name', '_ob').order('id'),
});

defineCase({
  id: 'filters.ilike.ascii',
  category: 'filters',
  why: 'ILIKE folds ASCII case in Postgres; SQLite LIKE does the same.',
  docs: DOCS.like,
  run: (sb) => sb.from('people').select('id,name').ilike('name', 'alice').order('id'),
});

defineCase({
  id: 'filters.ilike.unicode',
  category: 'filters',
  why: 'Postgres ILIKE folds Unicode case (É/é); SQLite only folds plain ASCII.',
  docs: DOCS.like,
  run: (sb) => sb.from('people').select('id,name').ilike('name', 'émile').order('id'),
});

defineCase({
  id: 'filters.like.unicode-exact',
  category: 'filters',
  why: 'A case-sensitive LIKE on a non-ASCII prefix should behave the same on both.',
  docs: DOCS.like,
  run: (sb) => sb.from('people').select('id,name').like('name', 'é%').order('id'),
});

defineCase({
  id: 'filters.in.integers',
  category: 'filters',
  why: '`in` with a plain integer list.',
  docs: DOCS.operators,
  run: (sb) => sb.from('people').select('id').in('id', [1, 3, 5]).order('id'),
});

defineCase({
  id: 'filters.in.strings-with-comma',
  category: 'filters',
  why: 'supabase-js double-quotes list values containing commas; the server must parse the quotes.',
  docs: DOCS.operators,
  run: (sb) => sb.from('people').select('id,name').in('name', ['Carol, Jr.', 'Bob']).order('id'),
});

defineCase({
  id: 'filters.is.null',
  category: 'filters',
  why: '`is.null` selects rows whose value is NULL.',
  docs: DOCS.operators,
  run: (sb) => sb.from('people').select('id').is('score', null).order('id'),
});

defineCase({
  id: 'filters.not.is.null',
  category: 'filters',
  why: '`not.is.null` selects rows whose value is present.',
  docs: DOCS.operators,
  run: (sb) => sb.from('people').select('id').not('score', 'is', null).order('id'),
});

defineCase({
  id: 'filters.neq.excludes-null',
  category: 'filters',
  why: 'In SQL, NULL <> 5 is NULL, so rows with NULL score are not returned by neq.',
  docs: DOCS.operators,
  run: (sb) => sb.from('people').select('id').neq('score', 5).order('id'),
});

defineCase({
  id: 'filters.or.mixed',
  category: 'filters',
  why: '`or=(...)` with two different operators.',
  docs: DOCS.operators,
  run: (sb) => sb.from('people').select('id').or('score.gt.10,name.eq.Bob').order('id'),
});

defineCase({
  id: 'filters.eq.boolean',
  category: 'filters',
  why: 'Filtering a boolean column with `eq.true`; SQLite stores booleans as 0/1.',
  docs: DOCS.operators,
  run: (sb) => sb.from('people').select('id').eq('active', true).order('id'),
});

defineCase({
  id: 'filters.gt.invalid-integer',
  category: 'filters',
  why: 'Postgres rejects "abc" for an integer column (400, 22P02); SQLite compares it as text.',
  docs: DOCS.pgErrors,
  run: (sb) => sb.from('people').select('id').gt('id', 'abc'),
});

defineCase({
  id: 'filters.contains.jsonb',
  category: 'filters',
  why: '`cs` (@>) on a jsonb column; SQLite has no containment operator.',
  docs: DOCS.operators,
  run: (sb) => sb.from('people').select('id').contains('meta', { team: 'red' }).order('id'),
});

defineCase({
  id: 'filters.text-search',
  category: 'filters',
  why: 'Full-text search (`fts`) is Postgres-specific.',
  docs: DOCS.fts,
  knownGap: 'Full-text search is listed as not implemented in Lite docs/api-gap-analysis.md.',
  run: (sb) => sb.from('posts').select('id').textSearch('title', 'compilers').order('id'),
});
