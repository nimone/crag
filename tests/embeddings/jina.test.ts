import { test, expect } from "bun:test";
import { makeJinaEmbedder } from "@/lib/embeddings/jina";

test("returns embeddings sorted by index, one vector per input text", async () => {
  // Jina can return results out of order — test that the adapter re-sorts them
  const fakeFetch = async (_url: string, _opts: unknown) =>
    new Response(
      JSON.stringify({
        data: [
          { index: 1, embedding: [0.2, 0.3, 0.4] },
          { index: 0, embedding: [0.1, 0.2, 0.3] },
        ],
      }),
      { status: 200 },
    );

  const embed = makeJinaEmbedder("test-key", "jina-embeddings-v3", fakeFetch as never);
  const vecs = await embed(["hello", "world"], "search_document");
  expect(vecs).toEqual([
    [0.1, 0.2, 0.3],
    [0.2, 0.3, 0.4],
  ]);
});

test("empty input returns empty array without calling fetch", async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return new Response("", { status: 200 }); };
  const embed = makeJinaEmbedder("key", "jina-embeddings-v3", fakeFetch as never);
  expect(await embed([], "search_query")).toEqual([]);
  expect(called).toBe(false);
});

test("maps search_document to retrieval.passage task", async () => {
  let sentTask = "";
  const fakeFetch = async (_url: string, opts: { body: string }) => {
    sentTask = JSON.parse(opts.body).task;
    return new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }] }), { status: 200 });
  };
  const embed = makeJinaEmbedder("key", "jina-embeddings-v3", fakeFetch as never);
  await embed(["text"], "search_document");
  expect(sentTask).toBe("retrieval.passage");
});

test("maps search_query to retrieval.query task", async () => {
  let sentTask = "";
  const fakeFetch = async (_url: string, opts: { body: string }) => {
    sentTask = JSON.parse(opts.body).task;
    return new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }] }), { status: 200 });
  };
  const embed = makeJinaEmbedder("key", "jina-embeddings-v3", fakeFetch as never);
  await embed(["query"], "search_query");
  expect(sentTask).toBe("retrieval.query");
});
