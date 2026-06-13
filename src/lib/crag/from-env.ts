import type { CragDeps } from "@/lib/crag/pipeline";
import { getNumberEnv } from "@/lib/env";
import { retrieverFromEnv } from "@/lib/retrieval/retriever";
import { webSearchFromEnv } from "@/lib/search/web-search";
import { queryRewriterFromEnv } from "@/lib/crag/query-rewrite";
import { jinaRerankerFromEnv } from "@/lib/evaluator/jina-reranker";
import { cohereEvaluatorFromEnv } from "@/lib/evaluator/cohere-reranker";
import { llmJudgeFromEnv } from "@/lib/evaluator/llm-judge";

export type EvaluatorKind = "jina" | "cohere" | "llm-judge";

function pickEvaluator(kind: EvaluatorKind) {
  if (kind === "cohere") return cohereEvaluatorFromEnv();
  if (kind === "llm-judge") return llmJudgeFromEnv();
  return jinaRerankerFromEnv(); // default: jina
}

export function buildCragDeps(
  evaluatorKind: EvaluatorKind = "jina",
  onEvent?: CragDeps["onEvent"],
): CragDeps {
  return {
    retriever: { retrieve: retrieverFromEnv() },
    evaluator: pickEvaluator(evaluatorKind),
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
