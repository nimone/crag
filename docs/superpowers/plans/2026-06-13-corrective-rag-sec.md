# Self-Correcting RAG for SEC Filings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade agentic Corrective RAG (CRAG) system over SEC filings that grades its own retrieval, self-corrects (decompose-recompose + web-search fallback), streams answers, visualizes the mechanism in a UI, and ships with an evaluator benchmark and live deployment.

**Architecture:** All-TypeScript single Next.js app (frontend + API routes) running on Bun. A hand-rolled CRAG state machine orchestrates retrieve → evaluate → action-trigger (Correct/Incorrect/Ambiguous) → corrective action → generate. Pure logic (action trigger, decompose-recompose, query rewrite, pipeline) is dependency-injected and unit-tested; external services (pgvector, Cohere, Tavily, OpenRouter, Langfuse) sit behind thin adapters.

**Tech Stack:** TypeScript · Bun (runtime + `bun test`) · Next.js · Vercel AI SDK + OpenRouter · Supabase (pgvector) · Cohere (embeddings + rerank) · Tavily · Langfuse · Docker + Vercel.

**Spec:** `docs/superpowers/specs/2026-06-13-corrective-rag-sec-design.md`

---

## File Structure

```
corrective-rag/
├── lib/
│   ├── types.ts                    # shared domain types (Chunk, ScoredChunk, CragAction, ...)
│   ├── env.ts                      # validated env var access
│   ├── llm/model.ts                # AI SDK + OpenRouter model factory
│   ├── embeddings/cohere.ts        # Cohere embeddings adapter
│   ├── retrieval/retriever.ts      # pgvector similarity search adapter
│   ├── search/web-search.ts        # Tavily adapter -> Chunk[]
│   ├── evaluator/
│   │   ├── types.ts                # Evaluator interface
│   │   ├── llm-judge.ts            # LLM-as-judge evaluator (OpenRouter)
│   │   └── cohere-reranker.ts      # Cohere rerank-v3.5 evaluator
│   ├── crag/
│   │   ├── action-trigger.ts       # decideAction(scores, thresholds) -> CragAction  [PURE]
│   │   ├── decompose.ts            # splitIntoStrips + recompose                       [PURE split]
│   │   ├── query-rewrite.ts        # rewriteToKeywords(query, llm)
│   │   └── pipeline.ts             # runCrag(...) orchestrator (DI)
│   └── observability/langfuse.ts   # trace helper
├── scripts/
│   └── ingest.ts                   # EDGAR fetch -> chunk -> embed -> upsert
├── eval/
│   ├── evaluator-benchmark.ts      # LLM-judge vs Cohere reranker on labeled set
│   ├── rag-vs-crag.ts              # head-to-head answer quality
│   └── data/                       # labeled relevance set + QA set (committed)
├── app/
│   ├── api/query/route.ts          # streaming CRAG endpoint (SSE of trace events + answer)
│   ├── page.tsx                    # chat UI
│   └── components/Inspector.tsx    # under-the-hood panel
├── supabase/schema.sql             # pgvector table + match function
├── tests/                          # bun test files mirror lib/ layout
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

**Design rule:** every external service is reached only through its adapter in `lib/`. The CRAG pipeline depends on *interfaces*, never on Cohere/Tavily/OpenRouter directly, so it is fully unit-testable with fakes.

---

## Phase 0 — Scaffold & tooling

### Task 0: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `lib/types.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Init git and Next.js app**

```bash
cd /media/DATA/Linux/home/Documents/Projects/new/corrective-rag
git init
bunx create-next-app@latest . --ts --app --eslint --tailwind --src-dir=false --import-alias "@/*" --no-turbopack --use-bun --yes
```
Expected: Next.js files created (`app/`, `package.json`, `tsconfig.json`). If `create-next-app` refuses because `docs/` exists, accept "continue in non-empty directory".

- [ ] **Step 2: Add dev/test deps**

```bash
bun add ai @openrouter/ai-sdk-provider cohere-ai @supabase/supabase-js langfuse zod
bun add -d @types/bun
```

- [ ] **Step 3: Create `.env.example`**

```bash
# .env.example
OPENROUTER_API_KEY=
COHERE_API_KEY=
TAVILY_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASEURL=https://cloud.langfuse.com
# CRAG config
CRAG_UPPER_THRESHOLD=0.7
CRAG_LOWER_THRESHOLD=0.3
CRAG_TOP_K=5
GEN_MODEL=anthropic/claude-sonnet-4-6
JUDGE_MODEL=anthropic/claude-haiku-4-5-20251001
```

- [ ] **Step 4: Create `lib/types.ts`**

```ts
export interface ChunkMetadata {
  company: string;
  filingType: "10-K" | "10-Q";
  fiscalPeriod: string;
  section: string;
  url: string;
}

export interface Chunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

export interface ScoredChunk extends Chunk {
  score: number; // normalized relevance, 0..1
}

export type CragAction = "correct" | "incorrect" | "ambiguous";

export interface KnowledgeStrip {
  text: string;
  score: number;
  source: "internal" | "web";
}

export interface CragTraceEvent {
  step: string;
  data: unknown;
}
```

- [ ] **Step 5: Smoke test**

```ts
// tests/smoke.test.ts
import { test, expect } from "bun:test";
import type { CragAction } from "@/lib/types";

test("smoke: types load", () => {
  const a: CragAction = "correct";
  expect(a).toBe("correct");
});
```

- [ ] **Step 6: Run smoke test**

Run: `bun test tests/smoke.test.ts`
Expected: 1 pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Bun project with domain types"
```

---

## Phase 1 — CRAG core logic (pure, TDD)

This phase has no external dependencies — it is the heart of the paper and the easiest to test.

### Task 1: Action trigger

**Files:**
- Create: `lib/crag/action-trigger.ts`
- Test: `tests/crag/action-trigger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/crag/action-trigger.test.ts
import { test, expect, describe } from "bun:test";
import { decideAction } from "@/lib/crag/action-trigger";

const t = { upper: 0.7, lower: 0.3 };

describe("decideAction", () => {
  test("correct when top score >= upper", () => {
    expect(decideAction([0.2, 0.9, 0.5], t)).toBe("correct");
  });
  test("incorrect when top score < lower", () => {
    expect(decideAction([0.1, 0.25], t)).toBe("incorrect");
  });
  test("ambiguous when top score between thresholds", () => {
    expect(decideAction([0.5, 0.4], t)).toBe("ambiguous");
  });
  test("incorrect when no scores", () => {
    expect(decideAction([], t)).toBe("incorrect");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/crag/action-trigger.test.ts`
Expected: FAIL — `decideAction` not found.

- [ ] **Step 3: Implement**

```ts
// lib/crag/action-trigger.ts
import type { CragAction } from "@/lib/types";

export interface Thresholds {
  upper: number;
  lower: number;
}

export function decideAction(scores: number[], t: Thresholds): CragAction {
  const top = scores.length ? Math.max(...scores) : 0;
  if (top >= t.upper) return "correct";
  if (top < t.lower) return "incorrect";
  return "ambiguous";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/crag/action-trigger.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/crag/action-trigger.ts tests/crag/action-trigger.test.ts
git commit -m "feat: CRAG action trigger with upper/lower thresholds"
```

### Task 2: Decompose (sentence splitting)

**Files:**
- Create: `lib/crag/decompose.ts`
- Test: `tests/crag/decompose.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/crag/decompose.test.ts
import { test, expect, describe } from "bun:test";
import { splitIntoStrips } from "@/lib/crag/decompose";

describe("splitIntoStrips", () => {
  test("splits on sentence boundaries", () => {
    const out = splitIntoStrips("Revenue grew. Costs fell! Why? Margins improved.");
    expect(out).toEqual(["Revenue grew.", "Costs fell!", "Why?", "Margins improved."]);
  });
  test("trims and drops empty fragments", () => {
    expect(splitIntoStrips("  A.   \n\n B. ")).toEqual(["A.", "B."]);
  });
  test("returns single strip when no terminator", () => {
    expect(splitIntoStrips("no terminator here")).toEqual(["no terminator here"]);
  });
  test("empty input -> empty array", () => {
    expect(splitIntoStrips("   ")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/crag/decompose.test.ts`
Expected: FAIL — `splitIntoStrips` not found.

- [ ] **Step 3: Implement**

```ts
// lib/crag/decompose.ts
import type { Evaluator } from "@/lib/evaluator/types";

export function splitIntoStrips(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((s) => s.trim())
    .filter((s) => s.length > 0) ?? [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/crag/decompose.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/crag/decompose.ts tests/crag/decompose.test.ts
git commit -m "feat: decompose documents into sentence strips"
```

### Task 3: Recompose (score strips, keep relevant)

**Files:**
- Modify: `lib/crag/decompose.ts`
- Modify: `tests/crag/decompose.test.ts`

- [ ] **Step 1: Write the failing test (uses a fake evaluator)**

```ts
// append to tests/crag/decompose.test.ts
import { recompose } from "@/lib/crag/decompose";
import type { Evaluator } from "@/lib/evaluator/types";

// fake: score = 1 if strip contains "keep", else 0
const fakeEval: Evaluator = {
  name: "fake",
  async score(_q, docs) {
    return docs.map((d) => (d.includes("keep") ? 1 : 0));
  },
};

describe("recompose", () => {
  test("keeps only strips scoring >= keepThreshold, preserves order", async () => {
    const text = "drop this. keep one. drop that. keep two.";
    const out = await recompose("q", text, fakeEval, 0.5);
    expect(out).toBe("keep one. keep two.");
  });
  test("empty when nothing passes", async () => {
    const out = await recompose("q", "drop a. drop b.", fakeEval, 0.5);
    expect(out).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/crag/decompose.test.ts`
Expected: FAIL — `recompose` not found.

- [ ] **Step 3: Implement (append to `lib/crag/decompose.ts`)**

```ts
// append to lib/crag/decompose.ts
export async function recompose(
  query: string,
  text: string,
  evaluator: Evaluator,
  keepThreshold: number,
): Promise<string> {
  const strips = splitIntoStrips(text);
  if (strips.length === 0) return "";
  const scores = await evaluator.score(query, strips);
  return strips
    .filter((_, i) => scores[i] >= keepThreshold)
    .join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/crag/decompose.test.ts`
Expected: all pass (6 total in file).

- [ ] **Step 5: Commit**

```bash
git add lib/crag/decompose.ts tests/crag/decompose.test.ts
git commit -m "feat: recompose keeps only relevant strips"
```

### Task 4: Evaluator interface

**Files:**
- Create: `lib/evaluator/types.ts`
- Test: `tests/evaluator/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/evaluator/types.test.ts
import { test, expect } from "bun:test";
import type { Evaluator } from "@/lib/evaluator/types";

test("an Evaluator returns one score per doc, aligned to input order", async () => {
  const e: Evaluator = {
    name: "len",
    async score(_q, docs) {
      return docs.map((d) => Math.min(1, d.length / 10));
    },
  };
  const out = await e.score("q", ["ab", "abcdefghijkl"]);
  expect(out.length).toBe(2);
  expect(out[0]).toBeLessThan(out[1]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/evaluator/types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/evaluator/types.ts
export interface Evaluator {
  /** Human-readable id used in traces and benchmarks. */
  name: string;
  /** Returns a relevance score in [0,1] for each doc, aligned to input order. */
  score(query: string, docs: string[]): Promise<number[]>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/evaluator/types.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluator/types.ts tests/evaluator/types.test.ts
git commit -m "feat: Evaluator interface"
```

### Task 5: Pipeline orchestrator (DI, the three actions)

**Files:**
- Create: `lib/crag/pipeline.ts`
- Test: `tests/crag/pipeline.test.ts`

- [ ] **Step 1: Write the failing test (all deps faked)**

```ts
// tests/crag/pipeline.test.ts
import { test, expect, describe } from "bun:test";
import { runCrag } from "@/lib/crag/pipeline";
import type { Chunk } from "@/lib/types";
import type { Evaluator } from "@/lib/evaluator/types";

const chunk = (id: string, text: string): Chunk => ({
  id,
  text,
  metadata: { company: "ACME", filingType: "10-K", fiscalPeriod: "FY23", section: "MD&A", url: "u" },
});

function makeDeps(opts: {
  retrieved: Chunk[];
  scoreFor: (doc: string) => number;
  web?: Chunk[];
}) {
  const events: string[] = [];
  const evaluator: Evaluator = {
    name: "fake",
    async score(_q, docs) {
      return docs.map(opts.scoreFor);
    },
  };
  return {
    events,
    deps: {
      retriever: { retrieve: async () => opts.retrieved },
      evaluator,
      webSearch: async () => opts.web ?? [],
      rewriteQuery: async (q: string) => `kw:${q}`,
      thresholds: { upper: 0.7, lower: 0.3 },
      keepThreshold: 0.5,
      onEvent: (e: { step: string }) => { events.push(e.step); },
    },
  };
}

describe("runCrag", () => {
  test("Correct path: high score -> internal context only, no web search", async () => {
    const { deps, events } = makeDeps({
      retrieved: [chunk("1", "keep relevant fact. noise drop.")],
      scoreFor: (d) => (d.includes("keep") || d.includes("relevant") ? 0.9 : 0.1),
    });
    const r = await runCrag("query", deps);
    expect(r.action).toBe("correct");
    expect(r.context).toContain("keep relevant fact.");
    expect(r.context).not.toContain("noise drop.");
    expect(events).not.toContain("web_search");
  });

  test("Incorrect path: low scores -> web search, internal discarded", async () => {
    const { deps, events } = makeDeps({
      retrieved: [chunk("1", "irrelevant body.")],
      scoreFor: (d) => (d.includes("keep") ? 0.9 : 0.1),
      web: [chunk("w", "keep web answer.")],
    });
    const r = await runCrag("query", deps);
    expect(r.action).toBe("incorrect");
    expect(events).toContain("web_search");
    expect(r.context).toContain("keep web answer.");
    expect(r.context).not.toContain("irrelevant body.");
  });

  test("Ambiguous path: mid score -> both internal and web", async () => {
    const { deps, events } = makeDeps({
      retrieved: [chunk("1", "keep mid fact. drop noise.")],
      scoreFor: (d) =>
        d === "keep mid fact." ? 0.55 :
        d.includes("keep") ? 0.9 : 0.1,
      web: [chunk("w", "keep web extra.")],
    });
    const r = await runCrag("query", deps);
    expect(r.action).toBe("ambiguous");
    expect(events).toContain("web_search");
    expect(r.context).toContain("keep mid fact.");
    expect(r.context).toContain("keep web extra.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/crag/pipeline.test.ts`
Expected: FAIL — `runCrag` not found.

- [ ] **Step 3: Implement**

```ts
// lib/crag/pipeline.ts
import type { Chunk, CragAction } from "@/lib/types";
import type { Evaluator } from "@/lib/evaluator/types";
import { decideAction, type Thresholds } from "@/lib/crag/action-trigger";
import { recompose } from "@/lib/crag/decompose";

export interface CragDeps {
  retriever: { retrieve: (query: string) => Promise<Chunk[]> };
  evaluator: Evaluator;
  webSearch: (query: string) => Promise<Chunk[]>;
  rewriteQuery: (query: string) => Promise<string>;
  thresholds: Thresholds;
  keepThreshold: number;
  onEvent?: (e: { step: string; data?: unknown }) => void;
}

export interface CragResult {
  action: CragAction;
  context: string;
  scores: number[];
  retrieved: Chunk[];
}

async function refineAll(query: string, chunks: Chunk[], ev: Evaluator, keep: number): Promise<string> {
  const refined = await Promise.all(chunks.map((c) => recompose(query, c.text, ev, keep)));
  return refined.filter((s) => s.length > 0).join(" ");
}

export async function runCrag(query: string, deps: CragDeps): Promise<CragResult> {
  const emit = (step: string, data?: unknown) => deps.onEvent?.({ step, data });

  const retrieved = await deps.retriever.retrieve(query);
  emit("retrieve", { count: retrieved.length });

  const scores = await deps.evaluator.score(query, retrieved.map((c) => c.text));
  emit("evaluate", { scores });

  const action = decideAction(scores, deps.thresholds);
  emit("action", { action });

  let internal = "";
  let web = "";

  if (action === "correct" || action === "ambiguous") {
    internal = await refineAll(query, retrieved, deps.evaluator, deps.keepThreshold);
    emit("refine_internal", { length: internal.length });
  }

  if (action === "incorrect" || action === "ambiguous") {
    const kw = await deps.rewriteQuery(query);
    emit("query_rewrite", { kw });
    const webChunks = await deps.webSearch(kw);
    emit("web_search", { count: webChunks.length });
    web = await refineAll(query, webChunks, deps.evaluator, deps.keepThreshold);
    emit("refine_web", { length: web.length });
  }

  const context = [internal, web].filter((s) => s.length > 0).join("\n\n");
  emit("context_ready", { length: context.length });

  return { action, context, scores, retrieved };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/crag/pipeline.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/crag/pipeline.ts tests/crag/pipeline.test.ts
git commit -m "feat: CRAG pipeline orchestrator with correct/incorrect/ambiguous paths"
```

---

## Phase 2 — Service adapters

These wrap external APIs behind the interfaces the pipeline expects. Tests assert request shaping and response mapping using mocked `fetch`/SDK responses; no live network calls.

### Task 6: Env access

**Files:**
- Create: `lib/env.ts`
- Test: `tests/env.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/env.test.ts
import { test, expect } from "bun:test";
import { getEnv } from "@/lib/env";

test("getEnv returns a present var", () => {
  process.env.FOO_TEST = "bar";
  expect(getEnv("FOO_TEST")).toBe("bar");
});

test("getEnv throws a clear error when missing", () => {
  delete process.env.MISSING_TEST;
  expect(() => getEnv("MISSING_TEST")).toThrow("Missing required env var: MISSING_TEST");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/env.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/env.ts
export function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function getNumberEnv(name: string, fallback: number): number {
  const v = process.env[name];
  return v ? Number(v) : fallback;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/env.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/env.ts tests/env.test.ts
git commit -m "feat: validated env access"
```

### Task 7: Cohere reranker evaluator

**Files:**
- Create: `lib/evaluator/cohere-reranker.ts`
- Test: `tests/evaluator/cohere-reranker.test.ts`

- [ ] **Step 1: Write the failing test (inject a fake rerank client)**

```ts
// tests/evaluator/cohere-reranker.test.ts
import { test, expect } from "bun:test";
import { makeCohereEvaluator } from "@/lib/evaluator/cohere-reranker";

test("maps Cohere rerank results back to input order as [0,1] scores", async () => {
  // Cohere returns results sorted by relevance with original index + relevanceScore
  const fakeClient = {
    rerank: async (_args: unknown) => ({
      results: [
        { index: 2, relevanceScore: 0.9 },
        { index: 0, relevanceScore: 0.4 },
        { index: 1, relevanceScore: 0.1 },
      ],
    }),
  };
  const ev = makeCohereEvaluator(fakeClient as any, "rerank-v3.5");
  const scores = await ev.score("q", ["a", "b", "c"]);
  expect(scores).toEqual([0.4, 0.1, 0.9]); // realigned to input order
  expect(ev.name).toBe("cohere:rerank-v3.5");
});

test("empty docs returns empty scores without calling client", async () => {
  let called = false;
  const fakeClient = { rerank: async () => { called = true; return { results: [] }; } };
  const ev = makeCohereEvaluator(fakeClient as any, "rerank-v3.5");
  expect(await ev.score("q", [])).toEqual([]);
  expect(called).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/evaluator/cohere-reranker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/evaluator/cohere-reranker.ts
import { CohereClient } from "cohere-ai";
import type { Evaluator } from "@/lib/evaluator/types";
import { getEnv } from "@/lib/env";

interface RerankClient {
  rerank(args: { model: string; query: string; documents: string[] }): Promise<{
    results: { index: number; relevanceScore: number }[];
  }>;
}

export function makeCohereEvaluator(client: RerankClient, model = "rerank-v3.5"): Evaluator {
  return {
    name: `cohere:${model}`,
    async score(query, docs) {
      if (docs.length === 0) return [];
      const res = await client.rerank({ model, query, documents: docs });
      const scores = new Array<number>(docs.length).fill(0);
      for (const r of res.results) scores[r.index] = r.relevanceScore;
      return scores;
    },
  };
}

export function cohereEvaluatorFromEnv(): Evaluator {
  const client = new CohereClient({ token: getEnv("COHERE_API_KEY") });
  return makeCohereEvaluator(client as unknown as RerankClient);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/evaluator/cohere-reranker.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluator/cohere-reranker.ts tests/evaluator/cohere-reranker.test.ts
git commit -m "feat: Cohere rerank evaluator with input-order realignment"
```

### Task 8: LLM-as-judge evaluator

**Files:**
- Create: `lib/evaluator/llm-judge.ts`
- Test: `tests/evaluator/llm-judge.test.ts`

- [ ] **Step 1: Write the failing test (inject a fake scorer fn)**

```ts
// tests/evaluator/llm-judge.test.ts
import { test, expect } from "bun:test";
import { makeLlmJudgeEvaluator } from "@/lib/evaluator/llm-judge";

test("calls the scorer per doc and clamps to [0,1]", async () => {
  // scorer returns a raw number the LLM emitted; judge must clamp
  const calls: string[] = [];
  const scorer = async (_q: string, doc: string) => {
    calls.push(doc);
    return doc === "good" ? 1.5 : -0.2; // out of range on purpose
  };
  const ev = makeLlmJudgeEvaluator(scorer, "judge-model");
  const scores = await ev.score("q", ["good", "bad"]);
  expect(scores).toEqual([1, 0]);
  expect(calls).toEqual(["good", "bad"]);
  expect(ev.name).toBe("llm-judge:judge-model");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/evaluator/llm-judge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/evaluator/llm-judge.ts
import { generateObject } from "ai";
import { z } from "zod";
import type { Evaluator } from "@/lib/evaluator/types";
import { openrouter } from "@/lib/llm/model";
import { getEnv } from "@/lib/env";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// scorer: returns the LLM's raw relevance estimate for one (query, doc) pair.
export type Scorer = (query: string, doc: string) => Promise<number>;

export function makeLlmJudgeEvaluator(scorer: Scorer, model: string): Evaluator {
  return {
    name: `llm-judge:${model}`,
    async score(query, docs) {
      const raw = await Promise.all(docs.map((d) => scorer(query, d)));
      return raw.map(clamp01);
    },
  };
}

export function llmJudgeFromEnv(): Evaluator {
  const model = getEnv("JUDGE_MODEL");
  const scorer: Scorer = async (query, doc) => {
    const { object } = await generateObject({
      model: openrouter(model),
      schema: z.object({ relevance: z.number().min(0).max(1) }),
      prompt:
        `On a scale 0..1, how relevant is the DOCUMENT to answering the QUESTION?\n` +
        `Return only the score.\nQUESTION: ${query}\nDOCUMENT: ${doc}`,
    });
    return object.relevance;
  };
  return makeLlmJudgeEvaluator(scorer, model);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/evaluator/llm-judge.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/evaluator/llm-judge.ts tests/evaluator/llm-judge.test.ts
git commit -m "feat: LLM-as-judge evaluator (paper baseline)"
```

### Task 9: OpenRouter model factory

**Files:**
- Create: `lib/llm/model.ts`
- Test: `tests/llm/model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/llm/model.test.ts
import { test, expect } from "bun:test";

test("openrouter factory is configured from env and returns a model for an id", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  const { openrouter } = await import("@/lib/llm/model");
  const model = openrouter("anthropic/claude-haiku-4-5-20251001");
  expect(model).toBeDefined();
  expect(typeof model).toBe("object");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/llm/model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/llm/model.ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getEnv } from "@/lib/env";

const provider = createOpenRouter({ apiKey: getEnv("OPENROUTER_API_KEY") });

/** Returns an AI SDK LanguageModel for the given OpenRouter model id. */
export const openrouter = (modelId: string) => provider(modelId);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/llm/model.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/llm/model.ts tests/llm/model.test.ts
git commit -m "feat: OpenRouter model factory via AI SDK"
```

### Task 10: Query rewrite (keywords for web search)

**Files:**
- Create: `lib/crag/query-rewrite.ts`
- Test: `tests/crag/query-rewrite.test.ts`

- [ ] **Step 1: Write the failing test (inject fake generate fn)**

```ts
// tests/crag/query-rewrite.test.ts
import { test, expect } from "bun:test";
import { makeQueryRewriter } from "@/lib/crag/query-rewrite";

test("trims and collapses the model's keyword output", async () => {
  const fakeGen = async (_prompt: string) => "  Apple   current   stock price \n";
  const rewrite = makeQueryRewriter(fakeGen);
  expect(await rewrite("What is Apple's current stock price right now?")).toBe(
    "Apple current stock price",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/crag/query-rewrite.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/crag/query-rewrite.ts
import { generateText } from "ai";
import { openrouter } from "@/lib/llm/model";
import { getEnv } from "@/lib/env";

export type GenerateFn = (prompt: string) => Promise<string>;

export function makeQueryRewriter(gen: GenerateFn) {
  return async (query: string): Promise<string> => {
    const raw = await gen(
      `Rewrite the question as a short keyword web-search query. ` +
        `Return only keywords, no punctuation.\nQUESTION: ${query}`,
    );
    return raw.replace(/\s+/g, " ").trim();
  };
}

export function queryRewriterFromEnv() {
  const model = getEnv("JUDGE_MODEL");
  const gen: GenerateFn = async (prompt) => {
    const { text } = await generateText({ model: openrouter(model), prompt });
    return text;
  };
  return makeQueryRewriter(gen);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/crag/query-rewrite.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/crag/query-rewrite.ts tests/crag/query-rewrite.test.ts
git commit -m "feat: query rewriter for web-search fallback"
```

### Task 11: Tavily web search adapter

**Files:**
- Create: `lib/search/web-search.ts`
- Test: `tests/search/web-search.test.ts`

- [ ] **Step 1: Write the failing test (inject fake fetch)**

```ts
// tests/search/web-search.test.ts
import { test, expect } from "bun:test";
import { makeWebSearch } from "@/lib/search/web-search";

test("maps Tavily results to Chunk[]", async () => {
  const fakeFetch = async () =>
    new Response(
      JSON.stringify({
        results: [
          { title: "T1", content: "body one", url: "https://a" },
          { title: "T2", content: "body two", url: "https://b" },
        ],
      }),
      { status: 200 },
    );
  const search = makeWebSearch("key", fakeFetch as unknown as typeof fetch);
  const chunks = await search("apple stock price");
  expect(chunks.length).toBe(2);
  expect(chunks[0].text).toBe("body one");
  expect(chunks[0].metadata.url).toBe("https://a");
  expect(chunks[0].metadata.company).toBe("WEB");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/search/web-search.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/search/web-search.ts
import type { Chunk } from "@/lib/types";
import { getEnv } from "@/lib/env";

interface TavilyResult { title: string; content: string; url: string }

export function makeWebSearch(apiKey: string, fetchFn: typeof fetch = fetch) {
  return async (query: string): Promise<Chunk[]> => {
    const res = await fetchFn("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 5,
        include_domains: ["wikipedia.org"], // paper prioritizes authoritative sources; relax as needed
      }),
    });
    if (!res.ok) throw new Error(`Tavily error ${res.status}`);
    const data = (await res.json()) as { results: TavilyResult[] };
    return data.results.map((r, i) => ({
      id: `web-${i}`,
      text: r.content,
      metadata: { company: "WEB", filingType: "10-K", fiscalPeriod: "", section: r.title, url: r.url },
    }));
  };
}

export function webSearchFromEnv() {
  return makeWebSearch(getEnv("TAVILY_API_KEY"));
}
```
> Note: `filingType` is forced to a valid literal for web chunks; if web sources shouldn't carry a filing type, widen `ChunkMetadata.filingType` to `"10-K" | "10-Q" | "web"` in `lib/types.ts` and update this mapping. Decision deferred to implementation; default is the literal above.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/search/web-search.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/search/web-search.ts tests/search/web-search.test.ts
git commit -m "feat: Tavily web-search adapter"
```

### Task 12: Cohere embeddings adapter

**Files:**
- Create: `lib/embeddings/cohere.ts`
- Test: `tests/embeddings/cohere.test.ts`

- [ ] **Step 1: Write the failing test (inject fake client)**

```ts
// tests/embeddings/cohere.test.ts
import { test, expect } from "bun:test";
import { makeCohereEmbedder } from "@/lib/embeddings/cohere";

test("returns one vector per input text", async () => {
  const fakeClient = {
    embed: async (args: { texts: string[] }) => ({
      embeddings: args.texts.map((_t, i) => [i, i + 1, i + 2]),
    }),
  };
  const embed = makeCohereEmbedder(fakeClient as any, "embed-english-v3.0");
  const vecs = await embed(["a", "b"], "search_document");
  expect(vecs).toEqual([[0, 1, 2], [1, 2, 3]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/embeddings/cohere.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/embeddings/cohere.ts
import { CohereClient } from "cohere-ai";
import { getEnv } from "@/lib/env";

type InputType = "search_document" | "search_query";

interface EmbedClient {
  embed(args: { model: string; texts: string[]; inputType: InputType }): Promise<{
    embeddings: number[][];
  }>;
}

export function makeCohereEmbedder(client: EmbedClient, model = "embed-english-v3.0") {
  return async (texts: string[], inputType: InputType): Promise<number[][]> => {
    if (texts.length === 0) return [];
    const res = await client.embed({ model, texts, inputType });
    return res.embeddings;
  };
}

export function cohereEmbedderFromEnv() {
  const client = new CohereClient({ token: getEnv("COHERE_API_KEY") });
  return makeCohereEmbedder(client as unknown as EmbedClient);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/embeddings/cohere.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/embeddings/cohere.ts tests/embeddings/cohere.test.ts
git commit -m "feat: Cohere embeddings adapter"
```

---

## Phase 3 — Data layer (Supabase/pgvector + ingestion)

### Task 13: Database schema

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Write schema**

```sql
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
```

- [ ] **Step 2: Apply schema**

Run (in Supabase SQL editor or `psql`): paste `supabase/schema.sql`.
Expected: `vector` extension enabled, `filing_chunks` table + `match_chunks` function created.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: pgvector schema and match_chunks function"
```

### Task 14: Chunker (pure)

**Files:**
- Create: `lib/ingest/chunk.ts`
- Test: `tests/ingest/chunk.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/ingest/chunk.test.ts
import { test, expect, describe } from "bun:test";
import { chunkText } from "@/lib/ingest/chunk";

describe("chunkText", () => {
  test("splits into overlapping windows by word count", () => {
    const words = Array.from({ length: 250 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkText(words, { size: 100, overlap: 20 });
    expect(chunks.length).toBe(3); // 0-100, 80-180, 160-250
    expect(chunks[0].split(" ").length).toBe(100);
    // overlap: last 20 words of chunk0 are first 20 of chunk1
    expect(chunks[1].startsWith("w80 ")).toBe(true);
  });
  test("short text -> single chunk", () => {
    expect(chunkText("a b c", { size: 100, overlap: 20 })).toEqual(["a b c"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/ingest/chunk.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/ingest/chunk.ts
export function chunkText(text: string, opts: { size: number; overlap: number }): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= opts.size) return words.length ? [words.join(" ")] : [];
  const step = opts.size - opts.overlap;
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    chunks.push(words.slice(start, start + opts.size).join(" "));
    if (start + opts.size >= words.length) break;
  }
  return chunks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/ingest/chunk.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/chunk.ts tests/ingest/chunk.test.ts
git commit -m "feat: word-window chunker with overlap"
```

### Task 15: EDGAR fetch + HTML strip (pure parser)

**Files:**
- Create: `lib/ingest/edgar.ts`
- Test: `tests/ingest/edgar.test.ts`

- [ ] **Step 1: Write the failing test for the parser**

```ts
// tests/ingest/edgar.test.ts
import { test, expect } from "bun:test";
import { stripHtml } from "@/lib/ingest/edgar";

test("stripHtml removes tags and collapses whitespace", () => {
  const html = "<div>Revenue was <b>$100</b>.<script>x()</script></div>\n<p>Risk.</p>";
  expect(stripHtml(html)).toBe("Revenue was $100. Risk.");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/ingest/edgar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (parser + fetch helper)**

```ts
// lib/ingest/edgar.ts
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// SEC requires a descriptive User-Agent. See https://www.sec.gov/os/webmaster-faq#developers
const UA = "corrective-rag-demo contact@example.com";

export async function fetchFiling(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const res = await fetchFn(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`EDGAR fetch failed ${res.status} for ${url}`);
  return stripHtml(await res.text());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/ingest/edgar.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/edgar.ts tests/ingest/edgar.test.ts
git commit -m "feat: EDGAR fetch + HTML stripping"
```

### Task 16: Retriever (pgvector adapter)

**Files:**
- Create: `lib/retrieval/retriever.ts`
- Test: `tests/retrieval/retriever.test.ts`

- [ ] **Step 1: Write the failing test (inject fake supabase + embedder)**

```ts
// tests/retrieval/retriever.test.ts
import { test, expect } from "bun:test";
import { makeRetriever } from "@/lib/retrieval/retriever";

test("embeds query and maps match_chunks rows to Chunk[]", async () => {
  const fakeEmbed = async () => [[0.1, 0.2]];
  const fakeSupabase = {
    rpc: async (_fn: string, _args: unknown) => ({
      data: [
        { id: "1", text: "fact", company: "ACME", filing_type: "10-K",
          fiscal_period: "FY23", section: "MD&A", url: "u", similarity: 0.8 },
      ],
      error: null,
    }),
  };
  const retrieve = makeRetriever(fakeSupabase as any, fakeEmbed as any, 5);
  const chunks = await retrieve("query");
  expect(chunks[0].id).toBe("1");
  expect(chunks[0].metadata.company).toBe("ACME");
  expect(chunks[0].metadata.filingType).toBe("10-K");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/retrieval/retriever.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/retrieval/retriever.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Chunk } from "@/lib/types";
import { getEnv, getNumberEnv } from "@/lib/env";
import { cohereEmbedderFromEnv } from "@/lib/embeddings/cohere";

type Embedder = (texts: string[], inputType: "search_query") => Promise<number[][]>;

export function makeRetriever(supabase: SupabaseClient, embed: Embedder, topK: number) {
  return async (query: string): Promise<Chunk[]> => {
    const [embedding] = await embed([query], "search_query");
    const { data, error } = await supabase.rpc("match_chunks", {
      query_embedding: embedding,
      match_count: topK,
    });
    if (error) throw new Error(`match_chunks failed: ${error.message}`);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      text: r.text,
      metadata: {
        company: r.company,
        filingType: r.filing_type,
        fiscalPeriod: r.fiscal_period,
        section: r.section,
        url: r.url,
      },
    }));
  };
}

export function retrieverFromEnv() {
  const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const embedder = cohereEmbedderFromEnv();
  const embed: Embedder = (texts, inputType) => embedder(texts, inputType);
  return makeRetriever(supabase, embed, getNumberEnv("CRAG_TOP_K", 5));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/retrieval/retriever.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/retrieval/retriever.ts tests/retrieval/retriever.test.ts
git commit -m "feat: pgvector retriever adapter"
```

### Task 17: Ingestion script

**Files:**
- Create: `scripts/ingest.ts`
- Create: `scripts/filings.json` (list of companies + filing URLs)

- [ ] **Step 1: Define filings list**

```json
// scripts/filings.json
[
  { "company": "Apple", "filingType": "10-K", "fiscalPeriod": "FY2023",
    "url": "https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm" }
]
```
> Add 2–4 more companies (Microsoft, Nvidia) by finding their latest 10-K on EDGAR full-text search (https://efts.sec.gov/LATEST/search-index?q=...) and pasting the document URL. Start with 1–3 to keep ingestion fast.

- [ ] **Step 2: Write the ingestion script**

```ts
// scripts/ingest.ts
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import { fetchFiling } from "@/lib/ingest/edgar";
import { chunkText } from "@/lib/ingest/chunk";
import { cohereEmbedderFromEnv } from "@/lib/embeddings/cohere";
import filings from "./filings.json";

const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
const embed = cohereEmbedderFromEnv();

for (const f of filings) {
  console.log(`Fetching ${f.company} ${f.filingType}...`);
  const text = await fetchFiling(f.url);
  const chunks = chunkText(text, { size: 350, overlap: 50 });
  console.log(`  ${chunks.length} chunks; embedding...`);
  // Cohere embed: batch in groups of 96 (API limit)
  for (let i = 0; i < chunks.length; i += 96) {
    const batch = chunks.slice(i, i + 96);
    const vectors = await embed(batch, "search_document");
    const rows = batch.map((t, j) => ({
      id: `${f.company}-${f.fiscalPeriod}-${i + j}`,
      text: t,
      company: f.company,
      filing_type: f.filingType,
      fiscal_period: f.fiscalPeriod,
      section: "body",
      url: f.url,
      embedding: vectors[j],
    }));
    const { error } = await supabase.from("filing_chunks").upsert(rows);
    if (error) throw new Error(error.message);
    console.log(`  upserted ${i + batch.length}/${chunks.length}`);
  }
}
console.log("Ingestion complete.");
```

- [ ] **Step 3: Run ingestion**

Run: `bun run scripts/ingest.ts`
Expected: console logs per filing; rows appear in Supabase `filing_chunks`. Verify with a Supabase row count query.

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest.ts scripts/filings.json
git commit -m "feat: SEC filing ingestion script"
```

---

## Phase 4 — API + wiring

### Task 18: CRAG factory (wire pipeline from env)

**Files:**
- Create: `lib/crag/from-env.ts`
- Test: `tests/crag/from-env.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/crag/from-env.test.ts
import { test, expect } from "bun:test";

test("buildCragDeps reads thresholds from env", async () => {
  process.env.CRAG_UPPER_THRESHOLD = "0.8";
  process.env.CRAG_LOWER_THRESHOLD = "0.2";
  process.env.OPENROUTER_API_KEY = "k";
  process.env.COHERE_API_KEY = "k";
  process.env.TAVILY_API_KEY = "k";
  process.env.SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  process.env.JUDGE_MODEL = "m";
  const { buildCragDeps } = await import("@/lib/crag/from-env");
  const deps = buildCragDeps("cohere");
  expect(deps.thresholds).toEqual({ upper: 0.8, lower: 0.2 });
  expect(deps.evaluator.name).toContain("cohere");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/crag/from-env.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/crag/from-env.ts
import type { CragDeps } from "@/lib/crag/pipeline";
import { getNumberEnv } from "@/lib/env";
import { retrieverFromEnv } from "@/lib/retrieval/retriever";
import { webSearchFromEnv } from "@/lib/search/web-search";
import { queryRewriterFromEnv } from "@/lib/crag/query-rewrite";
import { cohereEvaluatorFromEnv } from "@/lib/evaluator/cohere-reranker";
import { llmJudgeFromEnv } from "@/lib/evaluator/llm-judge";

export function buildCragDeps(
  evaluatorKind: "cohere" | "llm-judge",
  onEvent?: CragDeps["onEvent"],
): CragDeps {
  return {
    retriever: { retrieve: retrieverFromEnv() },
    evaluator: evaluatorKind === "cohere" ? cohereEvaluatorFromEnv() : llmJudgeFromEnv(),
    webSearch: webSearchFromEnv(),
    rewriteQuery: queryRewriterFromEnv(),
    thresholds: {
      upper: getNumberEnv("CRAG_UPPER_THRESHOLD", 0.7),
      lower: getNumberEnv("CRAG_LOWER_THRESHOLD", 0.3),
    },
    keepThreshold: getNumberEnv("CRAG_KEEP_THRESHOLD", 0.5),
    onEvent,
  };
}
```
> Note: `retrieverFromEnv()` returns the retrieve function; `retriever` expects `{ retrieve }`. Confirm shape — adjust `from-env` to `{ retrieve: retrieverFromEnv() }` matches `CragDeps.retriever`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/crag/from-env.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/crag/from-env.ts tests/crag/from-env.test.ts
git commit -m "feat: build CRAG deps from env"
```

### Task 19: Streaming API route

**Files:**
- Create: `app/api/query/route.ts`

- [ ] **Step 1: Implement the route (SSE: trace events, then streamed answer)**

```ts
// app/api/query/route.ts
import { streamText } from "ai";
import { openrouter } from "@/lib/llm/model";
import { runCrag } from "@/lib/crag/pipeline";
import { buildCragDeps } from "@/lib/crag/from-env";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel function timeout (seconds)

export async function POST(req: Request) {
  const { query, evaluator = "cohere" } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      const deps = buildCragDeps(evaluator, (e) => send({ type: "trace", ...e }));
      const result = await runCrag(query, deps);
      send({ type: "result_meta", action: result.action, scores: result.scores });

      const { textStream } = streamText({
        model: openrouter(getEnv("GEN_MODEL")),
        prompt:
          `Answer the QUESTION using only the CONTEXT. Cite sources. ` +
          `If the context is insufficient, say so.\n` +
          `CONTEXT:\n${result.context}\n\nQUESTION: ${query}`,
      });
      for await (const delta of textStream) send({ type: "token", delta });
      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}
```

- [ ] **Step 2: Manual verification**

Run: `bun run dev` then in another shell:
```bash
curl -N -X POST http://localhost:3000/api/query \
  -H 'content-type: application/json' \
  -d '{"query":"What was Apple FY2023 revenue?"}'
```
Expected: a stream of `data: {...}` lines — trace events, `result_meta` with an action, then `token` deltas, then `done`.

- [ ] **Step 3: Commit**

```bash
git add app/api/query/route.ts
git commit -m "feat: streaming CRAG API route with trace events"
```

---

## Phase 5 — Frontend

### Task 20: Chat + Inspector UI

**Files:**
- Create: `app/components/Inspector.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Implement the page (chat input + answer stream + inspector)**

```tsx
// app/page.tsx
"use client";
import { useState } from "react";
import { Inspector, type TraceEvent } from "./components/Inspector";

export default function Home() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [action, setAction] = useState<string | null>(null);

  async function ask() {
    setAnswer(""); setEvents([]); setAction(null);
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n\n"); buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const msg = JSON.parse(line.slice(6));
        if (msg.type === "token") setAnswer((a) => a + msg.delta);
        else if (msg.type === "result_meta") setAction(msg.action);
        else if (msg.type === "trace") setEvents((e) => [...e, msg]);
      }
    }
  }

  return (
    <main className="grid grid-cols-2 gap-4 p-6 h-screen">
      <section className="flex flex-col gap-3">
        <h1 className="text-xl font-bold">Self-Correcting RAG · SEC Filings</h1>
        <div className="flex gap-2">
          <input className="border rounded px-3 py-2 flex-1" value={query}
            onChange={(e) => setQuery(e.target.value)} placeholder="Ask about a filing..." />
          <button className="bg-black text-white rounded px-4" onClick={ask}>Ask</button>
        </div>
        <div className="flex gap-2 text-sm">
          {["What was Apple's FY2023 net revenue?",
            "What is Apple's current stock price?"].map((q) => (
            <button key={q} className="underline" onClick={() => setQuery(q)}>{q}</button>
          ))}
        </div>
        {action && <div className="text-sm">Action: <b>{action}</b></div>}
        <article className="whitespace-pre-wrap border rounded p-3 flex-1 overflow-auto">{answer}</article>
      </section>
      <Inspector events={events} action={action} />
    </main>
  );
}
```

```tsx
// app/components/Inspector.tsx
export interface TraceEvent { type: "trace"; step: string; data?: unknown }

const ACTION_COLOR: Record<string, string> = {
  correct: "bg-green-100", incorrect: "bg-red-100", ambiguous: "bg-yellow-100",
};

export function Inspector({ events, action }: { events: TraceEvent[]; action: string | null }) {
  return (
    <aside className="border rounded p-3 overflow-auto">
      <h2 className="font-bold mb-2">Under the hood</h2>
      {action && (
        <div className={`inline-block px-2 py-1 rounded mb-2 ${ACTION_COLOR[action] ?? ""}`}>
          {action}
        </div>
      )}
      <ol className="text-xs font-mono space-y-1">
        {events.map((e, i) => (
          <li key={i} className="border-b pb-1">
            <b>{e.step}</b> {e.data ? JSON.stringify(e.data) : ""}
          </li>
        ))}
      </ol>
    </aside>
  );
}
```

- [ ] **Step 2: Manual verification**

Run: `bun run dev`, open http://localhost:3000, click the "current stock price" demo question.
Expected: answer streams; inspector shows `retrieve → evaluate → action(incorrect) → query_rewrite → web_search → ...`; action badge red.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/components/Inspector.tsx
git commit -m "feat: chat UI with CRAG inspector panel"
```

---

## Phase 6 — Observability

### Task 21: Langfuse tracing

**Files:**
- Create: `lib/observability/langfuse.ts`
- Modify: `app/api/query/route.ts`

- [ ] **Step 1: Implement the trace helper**

```ts
// lib/observability/langfuse.ts
import { Langfuse } from "langfuse";
import { getEnv } from "@/lib/env";

export function makeLangfuse() {
  return new Langfuse({
    publicKey: getEnv("LANGFUSE_PUBLIC_KEY"),
    secretKey: getEnv("LANGFUSE_SECRET_KEY"),
    baseUrl: process.env.LANGFUSE_BASEURL ?? "https://cloud.langfuse.com",
  });
}
```

- [ ] **Step 2: Wire into the route (wrap onEvent + generation)**

In `app/api/query/route.ts`, create a trace at request start and log each CRAG event as a span:

```ts
// inside POST, before buildCragDeps:
import { makeLangfuse } from "@/lib/observability/langfuse";
const lf = makeLangfuse();
const trace = lf.trace({ name: "crag-query", input: { query } });
// pass an onEvent that both SSE-sends and logs to langfuse:
const deps = buildCragDeps(evaluator, (e) => {
  send({ type: "trace", ...e });
  trace.event({ name: e.step, metadata: (e as any).data });
});
// after done:
trace.update({ output: { action: result.action } });
await lf.flushAsync();
```

- [ ] **Step 3: Manual verification**

Run a query, then open the Langfuse dashboard.
Expected: a `crag-query` trace with child events (`retrieve`, `evaluate`, `action`, ...), token usage, and latency.

- [ ] **Step 4: Commit**

```bash
git add lib/observability/langfuse.ts app/api/query/route.ts
git commit -m "feat: Langfuse tracing for CRAG queries"
```

---

## Phase 7 — Evaluation studies

### Task 22: Labeled relevance set + evaluator benchmark

**Files:**
- Create: `eval/data/relevance.jsonl`
- Create: `eval/evaluator-benchmark.ts`

- [ ] **Step 1: Create a small labeled set (start ~30–50 rows)**

```jsonl
// eval/data/relevance.jsonl  (one JSON object per line)
{"query":"Apple FY2023 net revenue","doc":"Total net sales were $383.3 billion in 2023.","relevant":true}
{"query":"Apple FY2023 net revenue","doc":"The company's headquarters are in Cupertino, California.","relevant":false}
```
> Bootstrap: pull real chunks from the ingested corpus, hand-label relevant/irrelevant for ~15 queries. Commit the file so the benchmark is reproducible.

- [ ] **Step 2: Write the benchmark script**

```ts
// eval/evaluator-benchmark.ts
import { cohereEvaluatorFromEnv } from "@/lib/evaluator/cohere-reranker";
import { llmJudgeFromEnv } from "@/lib/evaluator/llm-judge";

const rows = (await Bun.file("eval/data/relevance.jsonl").text())
  .trim().split("\n").map((l) => JSON.parse(l) as { query: string; doc: string; relevant: boolean });

const THRESH = 0.5;
for (const [name, ev] of [["cohere", cohereEvaluatorFromEnv()], ["llm-judge", llmJudgeFromEnv()]] as const) {
  const t0 = performance.now();
  let correct = 0;
  for (const r of rows) {
    const [score] = await ev.score(r.query, [r.doc]);
    const predicted = score >= THRESH;
    if (predicted === r.relevant) correct++;
  }
  const ms = performance.now() - t0;
  console.log(`${name}: accuracy=${(correct / rows.length).toFixed(3)} latency=${(ms / rows.length).toFixed(1)}ms/doc`);
}
```

- [ ] **Step 3: Run the benchmark**

Run: `bun run eval/evaluator-benchmark.ts`
Expected: accuracy + per-doc latency for both evaluators. Record results in README.

- [ ] **Step 4: Commit**

```bash
git add eval/data/relevance.jsonl eval/evaluator-benchmark.ts
git commit -m "feat: evaluator benchmark (Cohere reranker vs LLM-judge)"
```

### Task 23: RAG vs CRAG comparison

**Files:**
- Create: `eval/data/qa.jsonl`
- Create: `eval/rag-vs-crag.ts`

- [ ] **Step 1: Create a QA set**

```jsonl
// eval/data/qa.jsonl
{"query":"What was Apple's FY2023 total net sales?","expected":"383.3 billion"}
{"query":"What is Apple's current stock price?","expected":"WEB_FALLBACK"}
```

- [ ] **Step 2: Write the comparison script**

```ts
// eval/rag-vs-crag.ts
import { runCrag } from "@/lib/crag/pipeline";
import { buildCragDeps } from "@/lib/crag/from-env";
import { generateText } from "ai";
import { openrouter } from "@/lib/llm/model";
import { getEnv } from "@/lib/env";

const rows = (await Bun.file("eval/data/qa.jsonl").text())
  .trim().split("\n").map((l) => JSON.parse(l) as { query: string; expected: string });

const deps = buildCragDeps("cohere");
const gen = (ctx: string, q: string) =>
  generateText({ model: openrouter(getEnv("GEN_MODEL")),
    prompt: `Answer using only CONTEXT.\nCONTEXT:\n${ctx}\n\nQUESTION: ${q}` }).then((r) => r.text);

let cragHits = 0, ragHits = 0;
for (const r of rows) {
  // CRAG (with correction)
  const crag = await runCrag(r.query, deps);
  const cragAns = await gen(crag.context, r.query);
  // vanilla RAG: top-k context, no grading/correction
  const ragCtx = crag.retrieved.map((c) => c.text).join("\n\n");
  const ragAns = await gen(ragCtx, r.query);

  const contains = (a: string) => r.expected !== "WEB_FALLBACK" && a.includes(r.expected);
  if (r.expected === "WEB_FALLBACK" ? crag.action === "incorrect" : contains(cragAns)) cragHits++;
  if (contains(ragAns)) ragHits++;
  console.log(`Q: ${r.query}\n  CRAG[${crag.action}]: ${cragAns.slice(0, 80)}\n  RAG: ${ragAns.slice(0, 80)}`);
}
console.log(`CRAG: ${cragHits}/${rows.length}  RAG: ${ragHits}/${rows.length}`);
```

- [ ] **Step 3: Run the comparison**

Run: `bun run eval/rag-vs-crag.ts`
Expected: per-question output + final tallies showing CRAG ≥ RAG (esp. on the web-fallback question RAG hallucinates). Record in README.

- [ ] **Step 4: Commit**

```bash
git add eval/data/qa.jsonl eval/rag-vs-crag.ts
git commit -m "feat: RAG vs CRAG head-to-head evaluation"
```

---

## Phase 8 — Packaging & deploy

### Task 24: Docker

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`

- [ ] **Step 1: Dockerfile**

```dockerfile
# Dockerfile
FROM oven/bun:1.3.11 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.11 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.3.11 AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["bun", "run", "start"]
```

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: .env
```

```
# .dockerignore
node_modules
.next
.git
docs
```

- [ ] **Step 2: Build and run**

Run: `docker compose up --build`
Expected: app serves on http://localhost:3000.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "chore: Dockerize app"
```

### Task 25: Deploy + README

**Files:**
- Create: `README.md`
- Modify: `package.json` (ensure `dev`/`build`/`start` scripts)

- [ ] **Step 1: Deploy to Vercel**

Run: `bunx vercel --prod` (set env vars in Vercel project settings to match `.env.example`).
Expected: a public URL serving the app. Note `maxDuration=60` in the route; if the full pipeline exceeds it, lower top-k or split web-search into its own pre-step.

- [ ] **Step 2: Write README**

README must include: one-paragraph pitch, architecture diagram (the request-flow box from the spec), the three-action explanation, **benchmark results tables** (Task 22 + 23 output), setup/run instructions, env var list, and a demo GIF/Loom link.

- [ ] **Step 3: Commit**

```bash
git add README.md package.json
git commit -m "docs: README with architecture, results, and demo"
```

- [ ] **Step 4: Full test run**

Run: `bun test`
Expected: all unit tests green across `tests/`.

---

## Self-Review notes (addressed)

- **Spec coverage:** ingestion (T13–17), retriever (T16), dual evaluator + benchmark (T7,T8,T22), three actions + decompose-recompose (T1–3,T5), web fallback (T10,T11), generator/streaming (T19), frontend inspector (T20), observability (T21), RAG-vs-CRAG eval (T23), Docker+deploy (T24,T25). All spec sections map to tasks.
- **Type consistency:** `Evaluator.score(query, docs[]) -> number[]` used identically in T4, T7, T8, T22; `CragDeps.retriever` is `{ retrieve }` — T18 note flags the exact shape to match T16's `retrieverFromEnv()` return; `Chunk`/`ScoredChunk`/`CragAction` defined once in T0.
- **Open risks (from spec) folded into tasks:** Vercel timeout (T19 `maxDuration`, T25 mitigation note); labeled set construction (T22 Step 1); threshold calibration (env-driven, exercised in T22/T23).
