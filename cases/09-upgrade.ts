import { defineCase } from '../src/defineCase.ts';
import { DOCS } from './_helpers.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaseContext } from '../src/defineCase.ts';

// Upgrade check: data that Lite accepts today but Postgres rejects. An app that
// "graduates" from Lite to Supabase cannot migrate these rows without fixing them.
// Each case writes the value and reads it back; Postgres should refuse the write.

const cleanup = (sb: SupabaseClient, ctx: CaseContext) => sb.from('scratch').delete().like('label', `${ctx.runId}-up%`);

function writeAndRead(row: Record<string, unknown>, column: string) {
  return async (sb: SupabaseClient, ctx: CaseContext) => {
    const label = `${ctx.runId}-up-${column}`;
    const ins = await sb.from('scratch').insert({ label, ...row });
    if (ins.error) return ins;
    return sb.from('scratch').select(column).eq('label', label);
  };
}

defineCase({
  id: 'upgrade.text-in-integer-column',
  category: 'upgrade',
  why: 'SQLite type affinity stores "abc" in an INTEGER column; Postgres rejects it (22P02).',
  docs: DOCS.pgErrors,
  run: writeAndRead({ qty: 'abc' }, 'qty'),
  teardown: cleanup,
});

defineCase({
  id: 'upgrade.impossible-date',
  category: 'upgrade',
  why: 'SQLite stores "2024-02-30" as text; Postgres rejects it (22008).',
  docs: DOCS.pgErrors,
  run: writeAndRead({ due: '2024-02-30' }, 'due'),
  teardown: cleanup,
});

defineCase({
  id: 'upgrade.varchar-overflow',
  category: 'upgrade',
  why: 'SQLite ignores VARCHAR(5) length; Postgres rejects longer values (22001).',
  docs: DOCS.pgErrors,
  run: writeAndRead({ code: 'TOO-LONG' }, 'code'),
  teardown: cleanup,
});

defineCase({
  id: 'upgrade.boolean-from-text',
  category: 'upgrade',
  why: 'Postgres parses "yes" into boolean true; SQLite stores the string "yes" in a BOOLEAN column.',
  docs: DOCS.types,
  run: writeAndRead({ done: 'yes' }, 'done'),
  teardown: cleanup,
});
