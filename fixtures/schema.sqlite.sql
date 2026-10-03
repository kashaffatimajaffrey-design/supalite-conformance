-- SQLite schema for the TARGET side (Supabase Lite).
-- Same table/column names as schema.pg.sql, written the way a Lite user would.
-- Types follow SQLite affinity rules: booleans are INTEGER, timestamps/JSON are TEXT.
-- RLS policies cannot be expressed in SQL on Lite; see policies.lite.ts.

CREATE TABLE people (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  nickname   TEXT,
  score      INTEGER,
  rating     NUMERIC,
  active     BOOLEAN NOT NULL DEFAULT 1,
  born       DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  meta       JSON
);

CREATE TABLE authors (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE posts (
  id        INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors (id),
  title     TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE comments (
  id      INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  body    TEXT NOT NULL
);

CREATE TABLE notes (
  id        INTEGER PRIMARY KEY,
  owner_id  TEXT NOT NULL,
  body      TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE scratch (
  id    INTEGER PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  qty   INTEGER,
  done  BOOLEAN NOT NULL DEFAULT 0,
  due   DATE,
  code  VARCHAR(5)
);
