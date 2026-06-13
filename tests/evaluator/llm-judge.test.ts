import { test, expect } from "bun:test";
import { makeLlmJudgeEvaluator } from "@/lib/evaluator/llm-judge";

test("calls the scorer per doc and clamps to [0,1]", async () => {
  // scorer returns a raw number the LLM emitted; judge must clamp
  const calls: string[] = [];
  const scorer = async (_q: string, doc: string) => {
    calls.push(doc);
    return doc === "good" ? 1.5 : -0.2; // out of range on purpose
  };
  const ev = makeLlmJudgeEvaluator(scorer, "judge-model");
  const scores = await ev.score("q", ["good", "bad"]);
  expect(scores).toEqual([1, 0]);
  expect(calls).toEqual(["good", "bad"]);
  expect(ev.name).toBe("llm-judge:judge-model");
});
