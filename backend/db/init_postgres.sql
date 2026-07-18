-- One-time PostgreSQL bootstrap for AI Physio.
-- Run once as the postgres superuser:
--   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -f db\init_postgres.sql
-- It creates a dedicated low-privilege login role and an owned database, so the
-- app never connects as the superuser.

CREATE ROLE physio WITH LOGIN PASSWORD 'physio';

CREATE DATABASE physio OWNER physio;

-- Postgres 15+ locks down the public schema for non-owners; hand it to physio so
-- the app (connecting as physio) can create its tables.
\connect physio
ALTER SCHEMA public OWNER TO physio;
GRANT ALL ON SCHEMA public TO physio;
