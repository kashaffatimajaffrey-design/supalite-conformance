# Reference sources: where Supabase defines the behavior Lite has to match

The kit compares Lite against a running Supabase stack. This page goes one level deeper: for each root cause, it shows **the code in the reference stack that produces the correct behavior**. Supabase's data API is [PostgREST](https://github.com/PostgREST/postgrest) (Haskell) and its auth server is [GoTrue](https://github.com/supabase/auth) (Go), so that's where Lite's target behavior is actually written down.

All links are pinned to the versions the kit tests against: **PostgREST v16.4** and **GoTrue v2.197.0**, the images `supabase start` pulls with Supabase CLI 2.119.0. The same links appear on each root-cause card in the [report](https://kashaffatimajaffrey-design.github.io/supalite-conformance/).

Excerpts are short quotes for explanation. PostgREST and GoTrue are both MIT-licensed.

---

## PostgREST (Haskell)

### `like` is case-sensitive, because PostgREST hands the pattern to Postgres unchanged
[`Query/SqlFragment.hs:432-433`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/Query/SqlFragment.hs#L432-L433), [`:458`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/Query/SqlFragment.hs#L458)

```haskell
OpLike  -> fmtQuant quant $ unknownLiteral (T.map star val)
OpILike -> fmtQuant quant $ unknownLiteral (T.map star val)
...
star c = if c == '*' then '%' else c
```

The only rewrite is `*` → `%`. Everything else, including case sensitivity, is Postgres's `LIKE`, and `ilike` maps to Postgres's `ILIKE` ([`:149-150`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/Query/SqlFragment.hs#L149-L150)), which folds case using the database's locale (so `É`/`é` too). Lite compiles both to SQLite `LIKE`, which ignores ASCII case and folds nothing else. That's two root causes from one line. [olirice/supabase-lite#1](https://github.com/olirice/supabase-lite/pull/1) fixes the first by compiling `like` to SQLite `GLOB`.

### NULL ordering is whatever Postgres does by default
[`Query/SqlFragment.hs:389-408`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/Query/SqlFragment.hs#L389-L408), [`ApiRequest/QueryParams.hs:826-833`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/ApiRequest/QueryParams.hs#L826-L833)

```haskell
pgFmtOrderTerm qi ot =
  fmtOTerm ot <> " " <> SQL.sql (BS.unwords
      [ maybe mempty direction $ coDirection ot
      , maybe mempty nullOrder $ coNullOrder ot ])
...
pOrderTerm = do
  fld <- pField
  dir <- optionMaybe pOrdDir
  nls <- optionMaybe pNulls <* pEnd ...
```

Both the direction and `NULLS FIRST/LAST` are `Maybe`: PostgREST writes them only if the request has them. With no `nullsfirst`/`nullslast`, the order is Postgres's default: NULL sorts as the largest value, so last for `ASC` and first for `DESC`. SQLite's default is the opposite, so a port can't omit the clause the way PostgREST does; it has to spell out Postgres's default. The parser also shows `order=id` with **no direction** is valid (`optionMaybe pOrdDir`), which Lite rejects.

### Filter values are untyped, so Postgres converts and validates them
[`Query/SqlFragment.hs:429`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/Query/SqlFragment.hs#L429), [`:582-583`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/Query/SqlFragment.hs#L582-L583)

```haskell
Op op val -> " " <> simpleOperator op <> " " <> pgFmtUnknownLiteralForField (unknownLiteral val) fld
...
unknownLiteral :: Text -> SQL.Snippet
unknownLiteral = unknownEncoder . encodeUtf8
```

`eq.true`, `gt.abc` and the rest arrive as text and are sent as Postgres `unknown`-typed parameters, so Postgres converts them to the column's type. That explains two root causes at once:

- `active=eq.true` matches rows, because `'true'` becomes a real boolean. In Lite, the string `'true'` is compared against a stored `1`, so nothing matches.
- `id=gt.abc` fails with `22P02`, because `'abc'` can't become a `bigint`. PostgREST turns that into HTTP 400 (the catch-all in [`Error.hs:597`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/Error.hs#L597)). Lite compares text with an integer and returns `200 []`.

### Error codes and HTTP statuses come from one mapping table
[`Error.hs:541-597`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/Error.hs#L541-L597)

```haskell
"23503" -> HTTP.status409 -- foreign_key_violation
"23505" -> HTTP.status409 -- unique_violation
"42P01" -> HTTP.status404 -- undefined table
"42501" -> if authed then HTTP.status403 else HTTP.status401 -- insufficient privilege
...
_ -> HTTP.status400
```

PostgREST passes Postgres's SQLSTATE through as `code` and picks the status from this table. Its own errors have fixed codes: `PGRST100` for an unparsable query ([`:146`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/Error.hs#L146)) and `PGRST205` with 404 for an unknown table ([`:232-242`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/Error.hs#L232-L242)). Lite returns `QUERY_ERROR` with 400 for all of them. The table is short enough to port almost line for line.

The `42501` line is also the **RLS** finding: a `WITH CHECK` violation is a Postgres error, and PostgREST reports it as 401 (anon) or 403 (signed in). Lite answers `201 []`.

### 206 Partial Content
[`RangeQuery.hs:96-110`](https://github.com/PostgREST/postgrest/blob/v16.4/src/library/PostgREST/RangeQuery.hs#L96-L110)

```haskell
rangeStatus lower upper (Just total)
  | lower > total = status416 -- 416 Range Not Satisfiable
  | (1 + upper - lower) < total = status206 -- 206 Partial Content
  | otherwise = status200 -- 200 OK
```

When a count is known and the page is smaller than the total, the status is 206. Lite always returns 200. That's a three-case rule, and it also covers 416, which Lite doesn't produce.

---

## GoTrue (Go)

### The refresh token is a separate random string
[`internal/models/refresh_token.go:175-178`](https://github.com/supabase/auth/blob/v2.197.0/internal/models/refresh_token.go#L175-L178)

```go
func createRefreshToken(tx *storage.Connection, user *User, oldToken *RefreshToken, params *GrantParams) (*RefreshToken, error) {
	token := &RefreshToken{
		UserID: user.ID,
		Token:  crypto.SecureAlphanumeric(12),
```

A refresh token is 12 random alphanumeric characters stored in its own table, never the JWT. `GrantRefreshTokenSwap` ([`:67`](https://github.com/supabase/auth/blob/v2.197.0/internal/models/refresh_token.go#L67)) exchanges it for a new one on `grant_type=refresh_token`. Lite returns the access token as the refresh token and rejects that grant, so supabase-js can't keep a session alive past `expires_in`.

### Auth error codes
[`internal/api/apierrors/errorcode.go:20-103`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/apierrors/errorcode.go#L20-L103)

| Case in the kit | GoTrue source | What GoTrue returns |
|---|---|---|
| `auth.signup.duplicate-email` | [`signup.go:294`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/signup.go#L294) | 422 `user_already_exists`, only when autoconfirm is on (`enable_confirmations = false`, as in this kit's config) |
| `auth.signin.wrong-password` | [`token.go:111`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/token.go#L111) | 400 `invalid_credentials` |
| `auth.signout.revokes-session` | [`auth.go:155`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/auth.go#L155) | 403 `session_not_found` (supabase-js turns this into its own "Auth session missing!" error, which is what the kit sees) |
| `auth.signup.weak-password` | [`errors.go:121-125`](https://github.com/supabase/auth/blob/v2.197.0/internal/api/errors.go#L121-L125) | 422 `weak_password`, plus a `weak_password.reasons` list |

supabase-js reads these codes into `error.code`, so apps branch on them. Lite sends `{error, error_description}` without a code, and 500 for a weak password.

### The user object
[`internal/models/user.go:25-74`](https://github.com/supabase/auth/blob/v2.197.0/internal/models/user.go#L25-L74)

The `json:` tags on GoTrue's `User` struct are the shape supabase-js expects: `email_confirmed_at`, `phone`, `app_metadata`, `identities`, `is_anonymous` and the rest. Lite's user object is missing several of these (`auth.signup.session-shape`).

---

## Not from either codebase

Three root causes have no line to point at in PostgREST or GoTrue, because the behavior comes from Postgres itself:

- **Collation** (`ordering.text.collation`): the sort order of text depends on the database's locale.
- **Type checks on writes** (`upgrade.*`): Postgres rejects `'abc'` in an integer column, `2024-02-30` and over-length `varchar`, while SQLite's type affinity stores them.
- **Upsert**: PostgREST builds `INSERT … ON CONFLICT DO UPDATE`, which Postgres executes.

For those, each case links to the Postgres documentation instead.
