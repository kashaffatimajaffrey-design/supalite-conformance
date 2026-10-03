# supalite-conformance

> **Not affiliated with Supabase.** This is an independent community project. It is not an official Supabase repository and is not endorsed by Supabase.

Differential conformance tests: the same supabase-js calls against Supabase (Postgres) and Supabase Lite (SQLite), with every difference classified by severity.

**Report:** https://kashaffatimajaffrey-design.github.io/supalite-conformance/ (published by CI to GitHub Pages)

## What it is

A test suite that sends the same supabase-js call to two backends, compares the two answers, and reports every difference.

Lite only works if apps written for Supabase behave the same on it. Lite's own test suite checks SQLite against itself, so it cannot catch "Postgres would have returned something different". This kit runs that check.

```
            ┌──────────────── same test case ────────────────┐
            ▼                                                 ▼
  REFERENCE: supabase start                      TARGET: supabase-lite server
  (Postgres + PostgREST + GoTrue)                (Hono + SQLite, port 54400)
            │                                                 │
            └──────► normalize ──► diff ──► classify ──► results.json ──► report page
```

- **Black-box.** The kit only talks HTTP through `@supabase/supabase-js`. The target is a URL + key in the environment, so any other Supabase-compatible server can be tested the same way.
- **Same data on both sides.** [`fixtures/seed.json`](fixtures/seed.json) is the only source of test data. [`fixtures/gen-seed.ts`](fixtures/gen-seed.ts) generates the Postgres and SQLite INSERTs from it, and CI fails if the generated files are stale.
- **Deterministic.** No LLMs, no randomness in verdicts. Every case orders its rows (`.order('id')`) unless ordering is what it tests.
- **Pinned.** Supabase Lite is a git submodule pinned at [`olirice/supabase-lite@bf041d0`](https://github.com/olirice/supabase-lite/commit/bf041d07a38b0b2dc321c5ee15dc8b440ca1ca88). Its dependencies are pinned by [`targets/supabase-lite.package-lock.json`](targets/supabase-lite.package-lock.json). supabase-js and the Supabase CLI are pinned in `package.json` and the workflow.

## Severity

| Level | Meaning | Example |
|---|---|---|
| **S1** wrong data, no error | Worst: the app silently shows wrong results | `like` ignores case, NULLs sort first, `[]` on bad input |
| **S2** wrong shape or type | Same information, different JSON. Breaks typed apps | booleans as `1`/`0`, timestamps not normalized |
| **S3** wrong error format | Both fail, with a different status or code. Breaks error handling | `QUERY_ERROR` instead of `42703` |
| **S4** clearly unsupported | Fails loudly where Postgres works. Acceptable for a lite version | upsert, full-text search |

Loud failures (S4) are fine for Lite. Silent wrong data (S1) is what hurts users, so it is ranked first.

Classification is automatic ([`src/classify.ts`](src/classify.ts)):

- the reference rejects the request but the target returns data → **S1**
- both succeed, with different rows, values or counts → **S1**
- both succeed with the same information in different JSON (`1` vs `true`, `"4.50"` vs `4.5`, re-spelled timestamps, extra keys, status 200 vs 206) → **S2**
- both fail, with a different status or code → **S3**
- the reference succeeds and the target errors or supabase-js throws → **S4**

A few probe cases (for example "is the refresh token distinct from the access token?") set their severity explicitly, because the automatic rules cannot know what a derived fact means.

## Cases

| # | Category | File | What it covers |
|---|---|---|---|
| 1 | Filters | [`cases/01-filters.ts`](cases/01-filters.ts) | like/ilike (incl. Unicode), in, is, or/not, booleans, bad input, jsonb `cs`, full-text |
| 2 | Ordering & pagination | [`cases/02-ordering.ts`](cases/02-ordering.ts) | NULL order asc/desc, collation, range, limit, `count: 'exact'`, head, 206 |
| 3 | Data types | [`cases/03-types.ts`](cases/03-types.ts) | boolean, timestamptz, numeric, date, jsonb, `->>`, casts |
| 4 | Errors | [`cases/04-errors.ts`](cases/04-errors.ts) | PGRST116, 22P02, 42703, PGRST205, PGRST100, 23502, 23505 |
| 5 | Embedding | [`cases/05-embedding.ts`](cases/05-embedding.ts) | to-one, to-many, nested, alias, `!inner`, filters on embeds |
| 6 | Writes | [`cases/06-writes.ts`](cases/06-writes.ts) | insert/update/delete + returning, minimal, bulk, count, upsert |
| 7 | Auth | [`cases/07-auth.ts`](cases/07-auth.ts) | signUp/signIn shape, refresh token, refresh flow, getUser, signOut, error codes |
| 8 | RLS | [`cases/08-rls.ts`](cases/08-rls.ts) | same policy, same rows for anon vs signed-in; WITH CHECK; USING on update |
| 9 | Upgrade check | [`cases/09-upgrade.ts`](cases/09-upgrade.ts) | values SQLite stores that Postgres rejects, so data cannot move to Supabase |

A case looks like this:

```ts
defineCase({
  id: 'filters.like.case-sensitive',
  category: 'filters',
  why: 'Postgres LIKE is case-sensitive; SQLite LIKE ignores ASCII case.',
  docs: 'https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-LIKE',
  run: (sb) => sb.from('people').select('id,name').like('name', 'Al%').order('id'),
  ignore: [], // e.g. ['data[*].created_at'] for generated values
})
```

Optional fields: `setup` / `teardown` (run on each side, e.g. to clean up writes), `knownGap` (documented upstream gap), `severity` (for probe cases). `ctx.signedIn(email, password)` gives a signed-in client; `ctx.runId` is shared by both sides of one run, for unique emails and labels.

## Normalization

Before comparing, [`src/normalize.ts`](src/normalize.ts):

- keeps only `status`, `data`, `count` and `error.code` (+ `error.status` for auth) of a supabase-js result. Error **messages are never compared**;
- replaces JWTs with `<jwt>` and uuids that are not in the seed with `<uuid>` (seeded user ids stay, so RLS results are comparable);
- replaces paths listed in a case's `ignore` with `<ignored>`.

Timestamps are not stripped globally, because their format is one of the things under test.

## Run it locally

You need Node 20+ and Docker (the Supabase CLI runs the reference stack in containers).

```bash
git clone --recurse-submodules https://github.com/kashaffatimajaffrey-design/supalite-conformance
cd supalite-conformance
npm ci
npm run setup:lite                 # installs Lite's pinned dependencies inside the submodule

npx supabase start                 # reference: applies supabase/migrations + supabase/seed.sql
npx supabase status -o env         # copy API_URL and ANON_KEY into .env (see .env.example)

npm run lite                       # target: Lite on http://127.0.0.1:54400 (leave running)
npm run conformance                # in a second terminal: prints a pass/S1–S4 table
npm run report                     # site/index.html
```

No Docker? `npm run conformance -- --target-only` runs every case against Lite alone and records the raw answers without classifying them.

Other flags: `--only <text>` runs cases whose id contains the text; `--fail-on S1` exits non-zero if any S1 (or worse) is found.

If `better-sqlite3` fails to build on Windows, run the project inside WSL2 Ubuntu.

After changing `fixtures/seed.json` or `fixtures/schema.pg.sql`, run `npm run seed` and then `npx supabase db reset`.

## CI and the report

[`.github/workflows/conformance.yml`](.github/workflows/conformance.yml) runs on every push, on pull requests, weekly, and on demand. It:

1. installs the pinned Supabase CLI with `supabase/setup-cli` and runs `supabase start`, skipping services the kit does not use (studio, storage, realtime, edge runtime, logflare, vector, imgproxy, postgres-meta);
2. starts Lite, runs the cases, builds the report;
3. writes a summary table to the job summary and uploads `results/` as an artifact;
4. on the default branch, publishes the report to GitHub Pages.

The report header shows the versions tested (Lite commit, supabase-js, Supabase CLI, kit commit) so anyone can reproduce the results.

To turn on Pages once: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Differences do not fail the build; they are the output. The build fails only if the kit itself is broken (a case throws on the reference side) or a check fails (stale seed, unit tests, types).

## Repository layout

```
targets/
  supabase-lite/                 git submodule, pinned @ bf041d0
  supabase-lite.package-lock.json  pins Lite's npm dependencies
  lite-boot.ts                   starts Lite on :54400 with auth + RLS on, loads schema + seed
  config.ts                      REFERENCE_URL/KEY, TARGET_URL/KEY (from env or .env)
fixtures/
  seed.json                      the one source of truth for test data
  schema.pg.sql                  Postgres schema + RLS policies
  schema.sqlite.sql              SQLite schema
  policies.lite.ts               the same RLS policies, in Lite's policy() API
  gen-seed.ts                    seed.json → INSERTs for both databases
supabase/                        created by `supabase init`; migration and seed.sql are generated
src/
  defineCase.ts  runner.ts  normalize.ts  classify.ts  classify.test.ts
  report/build.ts  report/template.html
cases/01-filters.ts … 09-upgrade.ts
docs/postgres-vs-sqlite.md       one-page gap write-up
```

## Scope

- In scope: PostgREST data API (`supabase.from(...)`), GoTrue email/password auth, RLS.
- Out of scope: Storage, Realtime, Edge Functions. They are out of scope for Lite too.
- No fixes to Lite live here. This repo only measures.
- No compatibility percentage is claimed. The report lists what was measured, case by case.

See [`docs/postgres-vs-sqlite.md`](docs/postgres-vs-sqlite.md) for the underlying Postgres vs SQLite differences.

## License

MIT
