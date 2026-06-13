import { generateObject } from "ai";
import { z } from "zod";
import type { Evaluator } from "@/lib/evaluator/types";
import { openrouter } from "@/lib/llm/model";
import { getEnv } from "@/lib/env";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// scorer: returns the LLM's raw relevance estimate for one (query, doc) pair.
export type Scorer = (query: string, doc: string) => Promise<number>;

export function makeLlmJudgeEvaluator(scorer: Scorer, model: string): Evaluator {
  return {
    name: `llm-judge:${model}`,
    async score(query, docs) {
      const raw = await Promise.all(docs.map((d) => scorer(query, d)));
      return raw.map(clamp01);
    },
  };
}

export function llmJudgeFromEnv(): Evaluator {
  const model = getEnv("JUDGE_MODEL");
  const scorer: Scorer = async (query, doc) => {
    const { object } = await generateObject({
      model: openrouter(model),
      schema: z.object({ relevance: z.number().min(0).max(1) }),
      prompt:
        `On a scale 0..1, how relevant is the DOCUMENT to answering the QUESTION?\n` +
        `Return only the score.\nQUESTION: ${query}\nDOCUMENT: ${doc}`,
    });
    return object.relevance;
  };
  return makeLlmJudgeEvaluator(scorer, model);
}
