import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff, normalize, normalizeThrown, parsePath } from './normalize.ts';

const pg = (extra: Record<string, unknown> = {}) => ({
  data: [{ id: 1 }],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
  ...extra,
});

test('a supabase-js data response keeps only status, data, count and error.code', () => {
  const n = normalize(
    pg({
      data: null,
      status: 400,
      statusText: 'Bad Request',
      error: { code: '42703', message: 'column people.nope does not exist', details: null, hint: 'Perhaps…' },
    }),
  );
  assert.deepEqual(n.compared, { status: 400, data: null, count: null, error: { code: '42703' } });
  assert.equal(n.isError, true);
  // Messages are kept for humans, never compared.
  assert.equal((n.display as any).error.message, 'column people.nope does not exist');
  assert.equal((n.display as any).statusText, 'Bad Request');
});

test('an auth response compares error status and code', () => {
  const n = normalize({ data: { session: null }, error: { status: 422, code: 'weak_password', message: 'x' } });
  assert.deepEqual(n.compared, { data: { session: null }, error: { code: 'weak_password', status: 422 } });
  assert.equal(n.isError, true);
});

test('any other value is compared as { value }', () => {
  assert.deepEqual(normalize({ refreshIsJwt: false }).compared, { value: { refreshIsJwt: false } });
  assert.deepEqual(normalize(42).compared, { value: 42 });
  assert.equal(normalize({ ok: true }).isError, false);
});

test('keys are sorted, undefined and functions dropped, special values made JSON-safe', () => {
  const n = normalize({ b: 1, a: undefined, f: () => 1, d: new Date('2024-01-15T10:30:00Z'), x: NaN, big: 10n });
  assert.deepEqual(n.compared, { value: { b: 1, big: '10', d: '2024-01-15T10:30:00.000Z', x: 'NaN' } });
  assert.deepEqual(Object.keys((n.compared as any).value), ['b', 'big', 'd', 'x']);
});

test('circular references do not hang', () => {
  const o: Record<string, unknown> = { id: 1 };
  o.self = o;
  assert.deepEqual(normalize(o).compared, { value: { id: 1, self: '<circular>' } });
});

test('declaresUnsupported only for errors that say so', () => {
  const err = (message: string) => normalize(pg({ data: null, status: 400, error: { code: 'QUERY_ERROR', message } }));
  assert.equal(err("Feature 'Full-text search' is not supported in PostgREST-Lite").declaresUnsupported, true);
  assert.equal(err('Only password grant type is supported').declaresUnsupported, true);
  assert.equal(err('Upsert is not implemented').declaresUnsupported, true);
  assert.equal(err('no such column: posts.id').declaresUnsupported, false);
  assert.equal(err('UNIQUE constraint failed: scratch.label').declaresUnsupported, false);
  // A successful response never counts, whatever its data says.
  assert.equal(normalize(pg({ data: [{ note: 'not supported' }] })).declaresUnsupported, false);
});

test('a thrown error compares as { thrown: true } and keeps the message for display', () => {
  const n = normalizeThrown(new TypeError('boom'));
  assert.deepEqual(n.compared, { thrown: true });
  assert.deepEqual(n.display, { thrown: 'TypeError: boom' });
  assert.equal(n.isError && n.thrown, true);
});

test('ignore paths: index, object wildcard, and missing paths left alone', () => {
  const r = pg({ data: [{ id: 1, at: 'x' }, { id: 2, at: 'y' }] });
  assert.deepEqual((normalize(r, ['data[1].at']).compared as any).data, [
    { at: 'x', id: 1 },
    { at: '<ignored>', id: 2 },
  ]);
  assert.deepEqual(normalize({ a: { x: 1, y: 2 } }, ['value.a.*']).compared, {
    value: { a: { x: '<ignored>', y: '<ignored>' } },
  });
  assert.deepEqual(normalize(r, ['data[*].nope', 'data[5].id', 'missing.path']).compared, normalize(r).compared);
});

test('parsePath', () => {
  assert.deepEqual(parsePath('data[*].created_at'), ['data', '*', 'created_at']);
  assert.deepEqual(parsePath('data[0].session.user'), ['data', '0', 'session', 'user']);
});

test('diff reports absent keys and extra array items as undefined', () => {
  assert.deepEqual(diff({ a: 1 }, { a: 1, b: 2 }), [{ path: 'b', reference: undefined, target: 2 }]);
  assert.deepEqual(diff([1], [1, 2]), [{ path: '[1]', reference: undefined, target: 2 }]);
  assert.deepEqual(diff({ a: [1, { b: 1 }] }, { a: [1, { b: 1 }] }), []);
  assert.deepEqual(diff(null, { a: 1 }), [{ path: '(root)', reference: null, target: { a: 1 } }]);
});
