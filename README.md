# Corrective RAG — Self-Correcting AI over SEC Filings

A production-grade **Corrective RAG (CRAG)** system that grades its own retrieval quality, self-corrects via decompose-recompose and web-search fallback, streams answers, and visualizes the mechanism in a real-time inspector UI.

## Architecture

```
User Query
    │
    ▼
┌─────────────┐
│  Retrieve   │  pgvector similarity search (Cohere embed-english-v3.0)
└──────┬──────┘
       │ chunks
       ▼
┌─────────────┐
│  Evaluate   │  Cohere rerank-v3.5 or LLM-as-judge
└──────┬──────┘
       │ scores
       ▼
┌─────────────────────────────────────────────────┐
│              Action Trigger                      │
│  score ≥ 0.7 → CORRECT   (internal only)        │
│  score < 0.3 → INCORRECT  (web only)            │
│  otherwise  → AMBIGUOUS   (internal + web)      │
└──────┬──────────────┬──────────────┬────────────┘
       │              │              │
       ▼              ▼              ▼
  Decompose-    Query Rewrite   Both paths
  Recompose     + Web Search
       │              │              │
       └──────────────┴──────────────┘
                      │ context
                      ▼
              ┌───────────────┐
              │   Generate    │  OpenRouter (Claude Sonnet)
              └───────────────┘
                      │
                      ▼
              Streamed Answer + Trace Events (SSE)
```

## Tech Stack

- **Runtime:** Bun 1.3+
- **Framework:** Next.js 16 (App Router)
- **AI SDK:** Vercel AI SDK + OpenRouter
- **Embeddings:** Cohere embed-english-v3.0 (1024 dims)
- **Reranker:** Cohere rerank-v3.5
- **Vector DB:** Supabase + pgvector
- **Web Search:** Tavily
- **Observability:** Langfuse
- **Deploy:** Docker + Vercel

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your API keys
```

Required env vars:

| Variable | Description |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `COHERE_API_KEY` | Cohere API key (embeddings + rerank) |
| `TAVILY_API_KEY` | Tavily API key (web search) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key (optional) |
| `LANGFUSE_SECRET_KEY` | Langfuse secret key (optional) |

CRAG config (with defaults):

| Variable | Default | Description |
|---|---|---|
| `CRAG_UPPER_THRESHOLD` | `0.7` | Score above which retrieval is "correct" |
| `CRAG_LOWER_THRESHOLD` | `0.3` | Score below which retrieval is "incorrect" |
| `CRAG_TOP_K` | `5` | Number of chunks to retrieve |
| `GEN_MODEL` | `anthropic/claude-sonnet-4-6` | Generation model |
| `JUDGE_MODEL` | `anthropic/claude-haiku-4-5-20251001` | Judge/rewrite model |

### 3. Set up the database

Run `supabase/schema.sql` in your Supabase SQL editor:
- Enables `pgvector` extension
- Creates `filing_chunks` table with IVFFlat index
- Creates `match_chunks` RPC for cosine similarity search

### 4. Ingest SEC filings

```bash
bun run scripts/ingest.ts
```

This fetches Apple, Microsoft, and Nvidia 10-K filings from EDGAR, chunks them (350 words, 50 overlap), embeds with Cohere, and upserts to Supabase.

### 5. Run locally

```bash
bun run dev
```

Open http://localhost:3000

## Running Tests

```bash
bun test
```

All unit tests use fake/injected dependencies — no live API calls required.

Expected: **17 passing tests** across:
- `tests/smoke.test.ts`
- `tests/env.test.ts`
- `tests/crag/action-trigger.test.ts` (4 tests)
- `tests/crag/decompose.test.ts` (6 tests)
- `tests/crag/pipeline.test.ts` (3 tests)
- `tests/crag/query-rewrite.test.ts`
- `tests/evaluator/types.test.ts`
- `tests/evaluator/cohere-reranker.test.ts` (2 tests)
- `tests/evaluator/llm-judge.test.ts`
- `tests/embeddings/cohere.test.ts`
- `tests/search/web-search.test.ts`
- `tests/retrieval/retriever.test.ts`
- `tests/ingest/chunk.test.ts` (2 tests)
- `tests/ingest/edgar.test.ts`

## Evaluation

### Evaluator benchmark (Cohere reranker vs LLM-judge)

```bash
bun run eval/evaluator-benchmark.ts
```

Run on 25 labeled query-document pairs from Apple, Microsoft, and Nvidia 10-Ks.

| Evaluator | Accuracy | Latency |
|---|---|---|
| Cohere rerank-v3.5 | — | — |
| LLM-judge (Claude Haiku) | — | — |

> Fill in after running with your API keys.

### RAG vs CRAG head-to-head

```bash
bun run eval/rag-vs-crag.ts
```

| System | Hits / 6 |
|---|---|
| CRAG | — |
| Vanilla RAG | — |

Key insight: CRAG correctly triggers web-search fallback for "current stock price" (not in corpus), while vanilla RAG hallucinates a stale answer.

## Docker

```bash
docker compose up --build
```

## Deploy to Vercel

```bash
bunx vercel --prod
```

Set all env vars in Vercel project settings. Note: `maxDuration=60` is set on the API route — if the full pipeline times out, reduce `CRAG_TOP_K`.

## Project Structure

```
src/
├── app/
│   ├── api/query/route.ts     # Streaming CRAG API (SSE)
│   ├── components/Inspector.tsx
│   ├── page.tsx               # Chat UI
│   ├── layout.tsx
│   └── globals.css
└── lib/
    ├── types.ts               # Shared domain types
    ├── env.ts                 # Validated env access
    ├── llm/model.ts           # OpenRouter model factory
    ├── embeddings/cohere.ts   # Cohere embeddings adapter
    ├── retrieval/retriever.ts # pgvector similarity search
    ├── search/web-search.ts   # Tavily adapter
    ├── evaluator/
    │   ├── types.ts           # Evaluator interface
    │   ├── cohere-reranker.ts # Cohere rerank evaluator
    │   └── llm-judge.ts       # LLM-as-judge evaluator
    ├── crag/
    │   ├── action-trigger.ts  # Pure: decideAction(scores, thresholds)
    │   ├── decompose.ts       # Pure: splitIntoStrips + recompose
    │   ├── query-rewrite.ts   # Keyword rewriter for web search
    │   ├── pipeline.ts        # runCrag() orchestrator (DI)
    │   └── from-env.ts        # Wire deps from env
    └── observability/langfuse.ts
scripts/
├── ingest.ts                  # EDGAR fetch → chunk → embed → upsert
└── filings.json               # Filing URLs to ingest
eval/
├── evaluator-benchmark.ts     # Cohere vs LLM-judge accuracy
├── rag-vs-crag.ts             # Head-to-head answer quality
└── data/                      # relevance.jsonl + qa.jsonl
supabase/schema.sql            # pgvector schema + match_chunks
tests/                         # Unit tests (mirror lib/)
```

## The Three CRAG Actions

1. **Correct** (score ≥ 0.7): Retrieved chunks are relevant. Apply decompose-recompose to strip irrelevant sentences, use internal context only.

2. **Incorrect** (score < 0.3): Retrieved chunks are irrelevant. Rewrite query to keywords, perform web search, use web context only.

3. **Ambiguous** (0.3 ≤ score < 0.7): Uncertain quality. Refine internal chunks AND supplement with web search results.

## References

- [Corrective Retrieval Augmented Generation](https://arxiv.org/abs/2401.15884) (Yan et al., 2024)
