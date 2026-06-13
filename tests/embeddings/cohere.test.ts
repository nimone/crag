import { test, expect } from "bun:test";
import { makeCohereEmbedder } from "@/lib/embeddings/cohere";

test("returns one vector per input text", async () => {
  const fakeClient = {
    embed: async (args: { texts: string[] }) => ({
      embeddings: args.texts.map((_t, i) => [i, i + 1, i + 2]),
    }),
  };
  const embed = makeCohereEmbedder(fakeClient as never, "embed-english-v3.0");
  const vecs = await embed(["a", "b"], "search_document");
  expect(vecs).toEqual([[0, 1, 2], [1, 2, 3]]);
});
