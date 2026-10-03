import { defineCase } from '../src/defineCase.ts';
import { DOCS } from './_helpers.ts';

defineCase({
  id: 'types.boolean',
  category: 'types',
  why: 'Postgres returns JSON true/false; SQLite stores 1/0.',
  docs: DOCS.types,
  run: (sb) => sb.from('people').select('id,active').in('id', [1, 2]).order('id'),
});

defineCase({
  id: 'types.timestamptz.format',
  category: 'types',
  why: 'Postgres normalizes timestamptz to ISO 8601 in UTC; SQLite returns the text as inserted.',
  docs: DOCS.types,
  run: (sb) => sb.from('people').select('id,created_at').in('id', [1, 2, 3, 4, 5, 7]).order('id'),
});

defineCase({
  id: 'types.numeric',
  category: 'types',
  why: 'numeric(6,2) values, including whole numbers and NULL.',
  docs: DOCS.types,
  run: (sb) => sb.from('people').select('id,rating').in('id', [1, 2, 3, 4, 6]).order('id'),
});

defineCase({
  id: 'types.date',
  category: 'types',
  why: 'A date column, including NULL.',
  docs: DOCS.types,
  run: (sb) => sb.from('people').select('id,born').in('id', [1, 3, 4]).order('id'),
});

defineCase({
  id: 'types.jsonb.object',
  category: 'types',
  why: 'jsonb comes back as a JSON object, not a string; empty object and NULL included.',
  docs: DOCS.json,
  run: (sb) => sb.from('people').select('id,meta').in('id', [3, 4, 5]).order('id'),
});

defineCase({
  id: 'types.jsonb.arrow-text',
  category: 'types',
  why: '`meta->>team` extracts a JSON field as text.',
  docs: DOCS.json,
  run: (sb) => sb.from('people').select('id,team:meta->>team').in('id', [1, 3, 4]).order('id'),
});

defineCase({
  id: 'types.cast',
  category: 'types',
  why: 'PostgREST supports `col::type` casts in select.',
  docs: 'https://docs.postgrest.org/en/stable/references/api/tables_views.html#casting-columns',
  run: (sb) => sb.from('people').select('id,score::text').in('id', [1, 2]).order('id'),
});
