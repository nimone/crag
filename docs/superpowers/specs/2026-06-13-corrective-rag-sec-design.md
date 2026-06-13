# Self-Correcting RAG for SEC Filings — Design Spec

**Date:** 2026-06-13
**Status:** Approved design, pre-implementation
**Paper:** CRAG — Corrective Retrieval Augmented Generation (arXiv:2401.15884v3)

## 1. Summary

A production-grade, agentic **Corrective RAG (CRAG)** system that answers natural-language
questions over real **SEC 10-K/10-Q filings**. After retrieving candidate document chunks,
the system grades their relevance with a **retrieval evaluator** and takes one of three
corrective actions — **Correct**, **Incorrect**, or **Ambiguous** — including a **web-search
fallback** when the filings cannot answer the question. Every step is traced and surfaced in
a live "under the hood" inspector panel in the demo UI.

The project also includes a **benchmark study** that partially reproduces the paper's central
claim: a specialized cross-encoder evaluator vs. a general LLM-as-judge.

**Target audience:** full-stack AI engineer roles. Emphasis is on system architecture, an
interactive demo, evaluation rigor, observability, and live deployment — not on training
models from scratch.

## 2. Goals & Non-Goals

### Goals
- Faithfully implement CRAG's evaluator → action-trigger → corrective-action → generate pipeline.
- Answer questions over a real, verifiable corpus (SEC filings) where retrieval failure has
  obvious stakes.
- Make the self-correction mechanism **visible** in the UI (scores, action taken, discarded vs.
  kept content, web fallback).
- Produce two evaluation artifacts: (a) evaluator benchmark, (b) RAG vs. CRAG head-to-head.
- Ship a Dockerized app deployed live with a public URL.

### Non-Goals
- Fine-tuning a T5 evaluator like the original paper (we use a hosted cross-encoder instead).
- Reproducing the paper's exact datasets/numbers (we evaluate on our own SEC corpus + a small
  labeled relevance set).
- Multi-tenant auth, user accounts, or billing.

## 3. Architecture

All-TypeScript, single **Next.js** application (frontend + API routes) deployed on **Vercel**.

### Request flow
```
User question
  → Retrieve top-k chunks from vector DB (SEC filings)
  → RETRIEVAL EVALUATOR grades each (query, chunk) pair → relevance scores
  → ACTION TRIGGER (upper/lower thresholds):
      Correct   → decompose-recompose: keep relevant strips, drop noise
      Incorrect → discard chunks; rewrite query → web search (Tavily) → refine
      Ambiguous → do both; concatenate internal + web knowledge
  → GENERATOR (AI SDK + OpenRouter) streams answer + citations
  → every step traced to Langfuse and streamed to the UI inspector panel
```

The three-way branch is modeled as an explicit state machine. Decision: **hand-rolled graph**
(the control flow is small and more legible in interviews than a LangGraph.js abstraction).
Re-evaluate only if the flow grows complex.

## 4. Components

### 4.1 Ingestion pipeline (offline script)
- Pull 10-K/10-Q filings for ~3–5 companies (e.g., Apple, Microsoft, Nvidia) from **SEC EDGAR**
  (free, no auth).
- Strip HTML, chunk by section, attach metadata (company, filing type, fiscal period, section).
- Embed with **Cohere `embed-english-v3.0`** and upsert into **Supabase (pgvector)**.
- Start with a manageable corpus (~3–5 companies); expandable later.

### 4.2 Retriever
- Vector similarity search over pgvector, top-k chunks with metadata.

### 4.3 Retrieval evaluator (headline component)
Two interchangeable implementations behind a single `Evaluator` interface:
- **LLM-as-judge** — fast cheap model via OpenRouter scores (query, chunk) relevance. (Paper's *baseline*.)
- **Cross-encoder reranker** — **Cohere `rerank-v3.5`** hosted endpoint. (Spirit of the paper's fine-tuned T5.)

Returns a normalized relevance score per chunk. The active evaluator is configurable.

### 4.4 Action trigger
- Configurable **upper** and **lower** thresholds on the top relevance score.
  - top score ≥ upper → **Correct**
  - top score < lower → **Incorrect**
  - otherwise → **Ambiguous**

### 4.5 Corrective actions
- **Decompose-recompose:** split retrieved docs into sentences/strips, re-score each with the
  evaluator, keep only relevant strips, concatenate into concentrated context.
- **Web fallback:** rewrite the question into keyword search terms (LLM), query **Tavily**,
  apply the same decompose-recompose to results.
- **Ambiguous:** combine refined internal strips + refined web strips.

### 4.6 Generator
- **Vercel AI SDK + OpenRouter**, streaming. Produces answer with inline citations to source
  chunks / web results.

### 4.7 Observability
- **Langfuse** traces every step (retrieval, per-chunk grades, action chosen, web fallback,
  generation) with token/latency/cost. Trace data is exposed to the frontend inspector panel.

## 5. Frontend (demo)

Next.js + React. Features:
- Streaming answer with citations.
- **Inspector panel** visualizing per query: retrieved chunks + relevance scores, action badge
  (Correct/Incorrect/Ambiguous), kept vs. discarded strips, web-fallback indicator,
  token/latency/cost (from Langfuse).
- **Canned demo questions** that deterministically exercise each path:
  - Correct: "What was Apple's FY2023 net revenue?"
  - Incorrect → web fallback: "What is Apple's current stock price?" (not in the filing)
  - Ambiguous: a partially-covered question.

## 6. Evaluation

Two studies, results rendered in the README (table + chart):
1. **Evaluator benchmark** — LLM-as-judge vs. Cohere reranker on a small labeled
   (query, doc, relevant?) set: accuracy, latency, cost. Partially reproduces the paper's
   "specialized model beats general LLM-judge" finding.
2. **RAG vs. CRAG** — head-to-head on a held-out question set over the filings: answer
   accuracy/faithfulness gain and graceful degradation when retrieval quality drops.

## 7. Deployment & Ops
- **Dockerized**; deployed **live on Vercel** with a public URL.
- Hosted dependencies: Supabase (pgvector), Cohere, Tavily, OpenRouter, Langfuse.
- README with architecture diagram, benchmark results, and a demo GIF/Loom.

## 8. Tech Stack Summary

| Concern            | Choice                                             |
|--------------------|----------------------------------------------------|
| Language           | TypeScript                                         |
| App framework      | Next.js (frontend + API routes)                    |
| LLM access         | Vercel AI SDK + OpenRouter                         |
| Vector DB          | Supabase (pgvector)                                |
| Embeddings         | Cohere `embed-english-v3.0`                        |
| Cross-encoder eval | Cohere `rerank-v3.5`                               |
| LLM-judge eval     | fast model via OpenRouter                          |
| Web search         | Tavily                                             |
| Observability      | Langfuse                                           |
| Deployment         | Docker + Vercel                                    |

## 9. Open Questions / Risks
- **Vercel serverless limits:** ingestion is an offline script (not serverless); confirm
  per-request latency (retrieval + grading + possible web search + generation) fits within
  Vercel function timeouts; consider streaming + edge/runtime config.
- **Labeled relevance set:** needs a small hand-labeled set for the evaluator benchmark; plan
  the labeling effort (could bootstrap with synthetic labels, then spot-check).
- **Threshold tuning:** upper/lower thresholds need calibration on the SEC corpus; treat as an
  eval-driven step.
