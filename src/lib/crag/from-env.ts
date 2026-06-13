import type { CragDeps } from "@/lib/crag/pipeline";
import { getNumberEnv } from "@/lib/env";
import { retrieverFromEnv } from "@/lib/retrieval/retriever";
import { webSearchFromEnv } from "@/lib/search/web-search";
import { queryRewriterFromEnv } from "@/lib/crag/query-rewrite";
import { cohereEvaluatorFromEnv } from "@/lib/evaluator/cohere-reranker";
import { llmJudgeFromEnv } from "@/lib/evaluator/llm-judge";

export function buildCragDeps(
  evaluatorKind: "cohere" | "llm-judge",
  onEvent?: CragDeps["onEvent"],
): CragDeps {
  return {
    retriever: { retrieve: retrieverFromEnv() },
    evaluator: evaluatorKind === "cohere" ? cohereEvaluatorFromEnv() : llmJudgeFromEnv(),
    webSearch: webSearchFromEnv(),
    rewriteQuery: queryRewriterFromEnv(),
    thresholds: {
      upper: getNumberEnv("CRAG_UPPER_THRESHOLD", 0.7),
      lower: getNumberEnv("CRAG_LOWER_THRESHOLD", 0.3),
    },
    keepThreshold: getNumberEnv("CRAG_KEEP_THRESHOLD", 0.5),
    onEvent,
  };
}
