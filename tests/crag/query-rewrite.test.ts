import { test, expect } from "bun:test";
import { makeQueryRewriter } from "@/lib/crag/query-rewrite";

test("trims and collapses the model's keyword output", async () => {
  const fakeGen = async (_prompt: string) => "  Apple   current   stock price \n";
  const rewrite = makeQueryRewriter(fakeGen);
  expect(await rewrite("What is Apple's current stock price right now?")).toBe(
    "Apple current stock price",
  );
});
