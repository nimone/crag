import { test, expect } from "bun:test";
import { makeJinaReranker } from "@/lib/evaluator/jina-reranker";

test("realigns Jina results back to input order", async () => {
  // Jina returns sorted by relevance_score, not by input order
  const fakeFetch = async (_url: string, _opts: unknown) =>
    new Response(
      JSON.stringify({
        results: [
          { index: 2, relevance_score: 0.95 },
          { index: 0, relevance_score: 0.42 },
          { index: 1, relevance_score: 0.08 },
        ],
      }),
      { status: 200 },
    );

  const ev = makeJinaReranker("test-key", "jina-reranker-v2-base-multilingual", fakeFetch as never);
  const scores = await ev.score("q", ["a", "b", "c"]);
  expect(scores).toEqual([0.42, 0.08, 0.95]); // realigned to input order
  expect(ev.name).toBe("jina:jina-reranker-v2-base-multilingual");
});

test("empty docs returns empty scores without calling fetch", async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return new Response("", { status: 200 }); };
  const ev = makeJinaReranker("key", "jina-reranker-v2-base-multilingual", fakeFetch as never);
  expect(await ev.score("q", [])).toEqual([]);
  expect(called).toBe(false);
});

test("sends top_n equal to number of documents", async () => {
  let sentTopN = 0;
  const fakeFetch = async (_url: string, opts: { body: string }) => {
    sentTopN = JSON.parse(opts.body).top_n;
    return new Response(
      JSON.stringify({ results: [{ index: 0, relevance_score: 0.5 }, { index: 1, relevance_score: 0.3 }] }),
      { status: 200 },
    );
  };
  const ev = makeJinaReranker("key", "model", fakeFetch as never);
  await ev.score("q", ["doc1", "doc2"]);
  expect(sentTopN).toBe(2);
});
