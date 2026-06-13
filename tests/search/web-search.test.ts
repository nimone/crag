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
