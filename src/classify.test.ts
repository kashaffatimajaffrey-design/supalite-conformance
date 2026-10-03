import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, looseEqual, toInstant } from './classify.ts';
import { normalize, normalizeThrown, diff } from './normalize.ts';

const pg = (data: unknown, extra: Record<string, unknown> = {}) => ({
  data,
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
  ...extra,
});
const pgErr = (status: number, code: string) => ({
  data: null,
  error: { code, message: 'x', details: null, hint: null },
  count: null,
  status,
  statusText: '',
});

test('identical responses pass', () => {
  assert.equal(classify(normalize(pg([{ id: 1 }])), normalize(pg([{ id: 1 }]))).verdict, 'pass');
});

test('error messages are not compared, only status + code', () => {
  const a = normalize({ ...pgErr(406, 'PGRST116'), error: { code: 'PGRST116', message: 'one' } });
  const b = normalize({ ...pgErr(406, 'PGRST116'), error: { code: 'PGRST116', message: 'two' } });
  assert.equal(classify(a, b).verdict, 'pass');
});

test('different rows are S1', () => {
  assert.equal(classify(normalize(pg([{ id: 1 }])), normalize(pg([{ id: 1 }, { id: 2 }]))).verdict, 'S1');
});

test('reference error, target silently returns data is S1', () => {
  assert.equal(classify(normalize(pgErr(400, '22P02')), normalize(pg([]))).verdict, 'S1');
});

test('booleans as 0/1, timestamps re-spelled, JSON as string are S2', () => {
  const ref = normalize(pg([{ a: true, t: '2024-01-15T10:30:00+00:00', j: { x: 1 }, n: 4.5 }]));
  const tgt = normalize(pg([{ a: 1, t: '2024-01-15 15:30:00+05', j: '{"x":1}', n: '4.50' }]));
  assert.equal(classify(ref, tgt).verdict, 'S2');
});

test('extra keys are S2, a changed value is S1', () => {
  assert.equal(classify(normalize(pg([{ id: 1 }])), normalize(pg([{ id: 1, extra: 2 }]))).verdict, 'S2');
  assert.equal(classify(normalize(pg([{ id: 1 }])), normalize(pg([{ id: 2 }]))).verdict, 'S1');
});

test('status-only difference is S2; count difference is S1', () => {
  assert.equal(classify(normalize(pg([1], { status: 206 })), normalize(pg([1]))).verdict, 'S2');
  assert.equal(classify(normalize(pg(null, { count: 3 })), normalize(pg(null, { count: 4 }))).verdict, 'S1');
});

test('both error with different codes is S3', () => {
  assert.equal(classify(normalize(pgErr(400, '42703')), normalize(pgErr(400, 'QUERY_ERROR'))).verdict, 'S3');
});

test('reference ok, target error is S4; target throw is S4; reference throw is a kit error', () => {
  assert.equal(classify(normalize(pg([])), normalize(pgErr(400, 'QUERY_ERROR'))).verdict, 'S4');
  assert.equal(classify(normalize(pg([])), normalizeThrown(new Error('boom'))).verdict, 'S4');
  assert.equal(classify(normalizeThrown(new Error('boom')), normalize(pg([]))).verdict, 'kit-error');
});

test('case severity override applies only when the sides differ', () => {
  const a = normalize({ refresh: true });
  assert.equal(classify(a, normalize({ refresh: false }), 'S2').verdict, 'S2');
  assert.equal(classify(a, normalize({ refresh: true }), 'S2').verdict, 'pass');
});

test('JWTs and non-seed uuids are redacted; seed uuids are kept', () => {
  const n = normalize({
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
    random: '0b6f1a2e-5d0c-4a7e-9f1b-3c2d1e0f9a8b',
    seeded: '11111111-1111-4111-8111-111111111111',
  });
  assert.deepEqual(n.compared, {
    value: { jwt: '<jwt>', random: '<uuid>', seeded: '11111111-1111-4111-8111-111111111111' },
  });
});

test('ignore paths with wildcards', () => {
  const n = normalize(pg([{ id: 1, at: 'x' }, { id: 2, at: 'y' }]), ['data[*].at']);
  assert.deepEqual((n.compared as any).data, [
    { at: '<ignored>', id: 1 },
    { at: '<ignored>', id: 2 },
  ]);
});

test('diff reports paths', () => {
  assert.deepEqual(diff({ a: [1, 2] }, { a: [1, 3] }), [{ path: 'a[1]', reference: 2, target: 3 }]);
});

test('timestamp parsing and loose equality', () => {
  assert.equal(toInstant('2024-03-10 08:00:00+00'), toInstant('2024-03-10T08:00:00+00:00'));
  assert.equal(toInstant('2024-03-11T12:00:00.123456+00:00'), Date.parse('2024-03-11T12:00:00.123Z'));
  assert.equal(toInstant('Alice'), null);
  assert.equal(looseEqual('yes', true), false);
  assert.equal(looseEqual([{ a: 1 }], { a: 1 }), true);
});
