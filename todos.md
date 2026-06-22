# Migration: Supabase → Self-hosted Postgres

## Plan

1. Install `pg` (Postgres driver) and `@types/pg`
2. Create `src/lib/db.ts` — shared pg Pool wrapper reading `DB_URL`
3. Rewrite `src/lib/retrieval/retriever.ts` — replace Supabase client + `.rpc()` with pg + raw SQL
4. Rewrite `scripts/ingest.ts` — replace Supabase client + `.upsert()` with pg + raw SQL
5. Update env vars: `.env.example`, `README.md`, `docker-compose.yml`, test files
6. Update tests to mock pg instead of Supabase
7. Remove `@supabase/supabase-js` from `package.json`, run `npm install` / `npm prune`
8. Update docs references
