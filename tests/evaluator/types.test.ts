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
