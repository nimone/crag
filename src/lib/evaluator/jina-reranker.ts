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

      const maxAttempts = 6;
      let delayMs = 2000;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
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

          if (res.status === 429) {
            throw { status: 429, message: "Rate limit reached" };
          }

          if (!res.ok) {
            const body = await res.text();
            throw new Error(`Jina rerank error ${res.status}: ${body}`);
          }

          const data = (await res.json()) as JinaRerankResponse;
          // Realign back to input order (Jina sorts by relevance by default)
          const scores = new Array<number>(docs.length).fill(0);
          for (const r of data.results) scores[r.index] = r.relevance_score;
          return scores;
        } catch (err: any) {
          const is429 = err?.status === 429 || String(err).includes("429") || String(err).includes("TooManyRequests");
          if (!is429 || attempt === maxAttempts) throw err;
          console.warn(
            `⚠️ [Jina Rerank] 429 rate limit hit, retrying in ${delayMs / 1000}s... (attempt ${attempt}/${maxAttempts})`
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2;
        }
      }
      throw new Error("Exhausted retries");
    },

  };
}

export function jinaRerankerFromEnv(): Evaluator {
  return makeJinaReranker(getEnv("JINA_API_KEY"));
}
