import { test, expect } from "bun:test";
import { makeRetriever } from "@/lib/retrieval/retriever";

test("embeds query and maps match_chunks rows to Chunk[]", async () => {
  const fakeEmbed = async () => [[0.1, 0.2]];
  const fakeQuery = async (_sql: string, _params?: unknown[]) => [
    {
      id: "1",
      text: "fact",
      company: "ACME",
      filing_type: "10-K",
      fiscal_period: "FY23",
      section: "MD&A",
      url: "u",
      similarity: 0.8,
    },
  ];
  const retrieve = makeRetriever(fakeQuery as never, fakeEmbed as never, 5);
  const chunks = await retrieve("query");
  expect(chunks[0].id).toBe("1");
  expect(chunks[0].metadata.company).toBe("ACME");
  expect(chunks[0].metadata.filingType).toBe("10-K");
});
