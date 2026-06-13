-- supabase/schema.sql
create extension if not exists vector;

create table if not exists filing_chunks (
  id text primary key,
  text text not null,
  company text not null,
  filing_type text not null,
  fiscal_period text not null,
  section text not null,
  url text not null,
  embedding vector(1024) not null  -- embed-english-v3.0 = 1024 dims
);

create index if not exists filing_chunks_embedding_idx
  on filing_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- top-k cosine similarity search, returns similarity in [0,1]
create or replace function match_chunks(query_embedding vector(1024), match_count int)
returns table (
  id text, text text, company text, filing_type text,
  fiscal_period text, section text, url text, similarity float
)
language sql stable as $$
  select c.id, c.text, c.company, c.filing_type, c.fiscal_period, c.section, c.url,
         1 - (c.embedding <=> query_embedding) as similarity
  from filing_chunks c
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
