import type { Evaluator } from "@/lib/evaluator/types";
import { getEnv } from "@/lib/env";

interface JinaRerankResult {
  index: number;
  relevance_score: number;
}

interface JinaRerankResponse {
  results: JinaRerankResult[];
}

export function makeJinaReranker(
  apiKey: string,
  model = "jina-reranker-v2-base-multilingual",
  fetchFn: typeof fetch = fetch,
): Evaluator {
  return {
    name: `jina:${model}`,
    async score(query, docs) {
      if (docs.length === 0) return [];

      const res = await fetchFn("https://api.jina.ai/v1/rerank", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          query,
          documents: docs,
          top_n: docs.length, // return a score for every doc
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Jina rerank error ${res.status}: ${body}`);
      }

      const data = (await res.json()) as JinaRerankResponse;
      // Realign back to input order (Jina sorts by relevance by default)
      const scores = new Array<number>(docs.length).fill(0);
      for (const r of data.results) scores[r.index] = r.relevance_score;
      return scores;
    },
  };
}

export function jinaRerankerFromEnv(): Evaluator {
  return makeJinaReranker(getEnv("JINA_API_KEY"));
}
