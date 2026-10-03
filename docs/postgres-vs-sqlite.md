# Postgres vs SQLite: where a Supabase-compatible API leaks

A one-page summary of the database-level differences that make "same supabase-js call, different answer" possible. Each item names the cases that measure it. The [report](https://kashaffatimajaffrey-design.github.io/supalite-conformance/) shows the current result for each case.

Not affiliated with Supabase.

## 1. Text matching

| | Postgres | SQLite |
|---|---|---|
| `LIKE` | case-sensitive | case-insensitive for ASCII by default (`PRAGMA case_sensitive_like` is off) |
| `ILIKE` | folds case using the database locale, including `É`/`é`, `Ü`/`ü` | no `ILIKE`; implementations fall back to `LIKE` or `lower()`, and both fold ASCII only |
| collation | defined by the database; the Supabase image sorts linguistically (`alice, Alice, ALICE, …, émile, Émile`) | `BINARY` (byte order: `ALICE, Alice, …, alice, Émile`) unless declared |

Risk: **S1**. A search box built on `.like()` returns extra rows on Lite. One built on `.ilike()` returns fewer rows for non-English names.
Cases: `filters.like.*`, `filters.ilike.*`, `ordering.text.collation`.

## 2. NULL ordering

Postgres treats NULL as larger than any value: `ASC` puts NULLs **last** and `DESC` puts them **first**. SQLite treats NULL as smaller than any value, so it does the opposite. PostgREST's `nullsfirst`/`nullslast` modifiers make the order explicit. Without them, an implementation has to emit `NULLS LAST` for `ASC` to match Postgres.

Risk: **S1**. A leaderboard sorted by score shows unscored users at the top.
Cases: `ordering.nulls.*`.

## 3. Types

SQLite has five storage classes (NULL, INTEGER, REAL, TEXT, BLOB) and *type affinity*: a declared column type is a hint, not a constraint.

| Postgres type | What SQLite stores | Visible effect |
|---|---|---|
| `boolean` | INTEGER 0/1 | JSON `1`/`0` instead of `true`/`false` (**S2**); `eq.true` compares against the text `'true'` (**S1**); JS booleans may not bind at all (**S4**) |
| `timestamptz` | TEXT as written | no normalization to UTC ISO 8601: `2024-01-15T15:30:00+05:00` comes back as written, not as `2024-01-15T10:30:00+00:00` (**S2**); sorting by text is wrong across time zones (**S1**) |
| `numeric(p,s)` | INTEGER or REAL | scale is lost; values beyond 2^53 lose precision |
| `jsonb` | TEXT | needs parsing on read; no `@>`, `->`, `->>` operators unless emulated with `json_extract` |
| `date` | TEXT | invalid dates such as `2024-02-30` are accepted |
| `varchar(n)` | TEXT | length is not enforced |
| `uuid` | TEXT | not validated; comparison is case-sensitive |

Cases: `types.*`, `filters.eq.boolean`, `writes.boolean-value`, `upgrade.*`.

## 4. Input validation

Postgres casts every filter value to the column type and rejects bad input: `id=gt.abc` → `400`, `22P02 invalid input syntax for type bigint`. SQLite compares across storage classes without complaint (an INTEGER is always less than TEXT), so the same request returns `[]` with `200`.

Risk: **S1**. Bugs that would surface immediately on Supabase hide on Lite.
Cases: `filters.gt.invalid-integer`, `errors.invalid-integer.eq`.

## 5. Error codes

supabase-js surfaces `error.code`, and apps branch on it: `23505` (unique violation) → "already taken", `PGRST116` → "not found", `42501` → "permission denied". PostgREST passes Postgres SQLSTATE codes through and adds its own `PGRSTxxx` codes, each with a specific HTTP status ([table](https://docs.postgrest.org/en/stable/references/errors.html)). SQLite reports `SQLITE_CONSTRAINT_*` with English messages, so an implementation has to map them back to SQLSTATE.

Risk: **S3**.
Cases: `errors.*`, `auth.*` error cases.

## 6. Writes and returning

PostgREST honors `Prefer: return=minimal|representation`, applies `select=` to the returned rows, answers inserts with `201` and partial pages with `206`, and implements upsert as `INSERT ... ON CONFLICT DO UPDATE`. SQLite has `RETURNING` (3.35+) and `ON CONFLICT` (3.24+), so all of this is possible. It just has to be mapped.

Cases: `writes.*`, `ordering.count.exact-with-range`.

## 7. Row Level Security

Postgres enforces RLS inside the database for every statement. A `WITH CHECK` failure is an error (`42501`, HTTP 403 for a signed-in user, 401 for anon). SQLite has no RLS, so it must be emulated in the API layer by rewriting queries. The dangerous failure mode is a write that violates `WITH CHECK` and is silently dropped (`201` with `[]`) instead of rejected.

Cases: `rls.*`.

## 8. Auth (GoTrue)

GoTrue issues a short opaque refresh token next to a JWT access token, rotates it on `grant_type=refresh_token`, ties tokens to a session id (`session_id` claim), and returns structured error codes (`invalid_credentials`, `user_already_exists`, `weak_password`, `session_not_found`) through `error_code`. A lighter implementation that reuses the access token as the refresh token cannot support the refresh flow. supabase-js will then fail to refresh after `expires_in`.

Cases: `auth.*`.

## 9. The upgrade path

Lite's promise is an upgrade path to full Supabase. Anything SQLite accepted that Postgres rejects blocks that path: text in integer columns, impossible dates, over-length varchar, free-form booleans. The kit writes such values to both backends. Postgres refuses them; if Lite stores them, the case is **S1**, because the data will not migrate.

Cases: `upgrade.*`.
