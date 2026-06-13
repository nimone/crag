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
      const maxAttempts = 6;
      let delayMs = 5000;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await client.rerank({ model, query, documents: docs });
          const scores = new Array<number>(docs.length).fill(0);
          for (const r of res.results) scores[r.index] = r.relevanceScore;
          return scores;
        } catch (err: any) {
          const is429 =
            err?.statusCode === 429 ||
            err?.status === 429 ||
            String(err).includes("429") ||
            String(err).includes("TooManyRequests");
          if (!is429 || attempt === maxAttempts) throw err;
          console.warn(
            `⚠️ [Cohere Rerank] 429 rate limit hit, retrying in ${delayMs / 1000}s... (attempt ${attempt}/${maxAttempts})`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2;
        }
      }
      throw new Error("Exhausted retries");
    },
  };
}

export function cohereEvaluatorFromEnv(): Evaluator {
  const client = new CohereClient({ token: getEnv("COHERE_API_KEY") });
  return makeCohereEvaluator(client as unknown as RerankClient);
}

