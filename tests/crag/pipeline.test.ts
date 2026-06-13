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
      // The full chunk text scores 0.55 (ambiguous), individual strips score by "keep" keyword
      scoreFor: (d) =>
        d === "keep mid fact. drop noise." ? 0.55 :
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
