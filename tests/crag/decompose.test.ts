import { test, expect, describe } from "bun:test";
import { splitIntoStrips, recompose } from "@/lib/crag/decompose";
import type { Evaluator } from "@/lib/evaluator/types";

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
