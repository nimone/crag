import { CohereClient } from "cohere-ai";
import type { Evaluator } from "@/lib/evaluator/types";
import { getEnv } from "@/lib/env";

interface RerankClient {
  rerank(args: { model: string; query: string; documents: string[] }): Promise<{
    results: { index: number; relevanceScore: number }[];
  }>;
}

export function makeCohereEvaluator(client: RerankClient, model = "rerank-v3.5"): Evaluator {
  return {
    name: `cohere:${model}`,
    async score(query, docs) {
      if (docs.length === 0) return [];
      const res = await client.rerank({ model, query, documents: docs });
      const scores = new Array<number>(docs.length).fill(0);
      for (const r of res.results) scores[r.index] = r.relevanceScore;
      return scores;
    },
  };
}

export function cohereEvaluatorFromEnv(): Evaluator {
  const client = new CohereClient({ token: getEnv("COHERE_API_KEY") });
  return makeCohereEvaluator(client as unknown as RerankClient);
}
