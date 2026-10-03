import { defineCase } from '../src/defineCase.ts';
import { DOCS } from './_helpers.ts';

defineCase({
  id: 'embedding.many-to-one',
  category: 'embedding',
  why: 'A to-one embed (post → author) returns an object, not an array.',
  docs: DOCS.embedding,
  run: (sb) => sb.from('posts').select('id,title,authors(name)').order('id'),
});

defineCase({
  id: 'embedding.one-to-many',
  category: 'embedding',
  why: 'A to-many embed (author → posts) returns an array, ordered via referencedTable.',
  docs: DOCS.embedding,
  run: (sb) =>
    sb.from('authors').select('id,name,posts(id,title)').order('id').order('id', { referencedTable: 'posts' }),
});

defineCase({
  id: 'embedding.nested',
  category: 'embedding',
  why: 'Two levels deep: authors → posts → comments.',
  docs: DOCS.embedding,
  // Comments are not explicitly ordered (see embedding.nested-order). On a freshly
  // seeded table Postgres returns them in insertion order, which is id order.
  run: (sb) =>
    sb.from('authors').select('id,posts(id,comments(id,body))').order('id').order('id', { referencedTable: 'posts' }),
});

defineCase({
  id: 'embedding.nested-order',
  category: 'embedding',
  why: 'Ordering a second-level embed with referencedTable "posts.comments".',
  docs: DOCS.ordering,
  run: (sb) =>
    sb
      .from('authors')
      .select('id,posts(id,comments(id))')
      .order('id')
      .order('id', { referencedTable: 'posts' })
      .order('id', { ascending: false, referencedTable: 'posts.comments' }),
});

defineCase({
  id: 'embedding.alias',
  category: 'embedding',
  why: 'Renaming an embedded resource with `alias:table(...)`.',
  docs: DOCS.embedding,
  run: (sb) => sb.from('posts').select('id,writer:authors(name)').order('id'),
});

defineCase({
  id: 'embedding.inner-join',
  category: 'embedding',
  why: '`!inner` drops parents that have no matching children.',
  docs: DOCS.embedding,
  run: (sb) => sb.from('posts').select('id,comments!inner(id)').order('id').order('id', { referencedTable: 'comments' }),
});

defineCase({
  id: 'embedding.filter-embedded-only',
  category: 'embedding',
  why: 'Filtering on an embedded column filters the children, not the parents.',
  docs: DOCS.embedding,
  run: (sb) =>
    sb
      .from('authors')
      .select('id,posts(id)')
      .gt('posts.id', 2)
      .order('id')
      .order('id', { referencedTable: 'posts' }),
});

defineCase({
  id: 'embedding.inner-filter-parents',
  category: 'embedding',
  why: '`!inner` plus a filter on the embed filters the parent rows.',
  docs: DOCS.embedding,
  run: (sb) => sb.from('posts').select('id,authors!inner(name)').eq('authors.name', 'Grace').order('id'),
});
