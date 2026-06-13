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
  const ev = makeCohereEvaluator(fakeClient as never, "rerank-v3.5");
  const scores = await ev.score("q", ["a", "b", "c"]);
  expect(scores).toEqual([0.4, 0.1, 0.9]); // realigned to input order
  expect(ev.name).toBe("cohere:rerank-v3.5");
});

test("empty docs returns empty scores without calling client", async () => {
  let called = false;
  const fakeClient = { rerank: async () => { called = true; return { results: [] }; } };
  const ev = makeCohereEvaluator(fakeClient as never, "rerank-v3.5");
  expect(await ev.score("q", [])).toEqual([]);
  expect(called).toBe(false);
});
