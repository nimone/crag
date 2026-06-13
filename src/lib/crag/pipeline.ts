import type { Chunk, CragAction } from "@/lib/types";
import type { Evaluator } from "@/lib/evaluator/types";
import { decideAction, type Thresholds } from "@/lib/crag/action-trigger";
import { recompose } from "@/lib/crag/decompose";

export interface CragDeps {
  retriever: { retrieve: (query: string) => Promise<Chunk[]> };
  evaluator: Evaluator;
  webSearch: (query: string) => Promise<Chunk[]>;
  rewriteQuery: (query: string) => Promise<string>;
  thresholds: Thresholds;
  keepThreshold: number;
  onEvent?: (e: { step: string; data?: unknown }) => void;
}

export interface CragResult {
  action: CragAction;
  context: string;
  scores: number[];
  retrieved: Chunk[];
}

async function refineAll(query: string, chunks: Chunk[], ev: Evaluator, keep: number): Promise<string> {
  const refined = await Promise.all(chunks.map((c) => recompose(query, c.text, ev, keep)));
  return refined.filter((s) => s.length > 0).join(" ");
}

export async function runCrag(query: string, deps: CragDeps): Promise<CragResult> {
  const emit = (step: string, data?: unknown) => deps.onEvent?.({ step, data });

  const retrieved = await deps.retriever.retrieve(query);
  emit("retrieve", { count: retrieved.length });

  const scores = await deps.evaluator.score(query, retrieved.map((c) => c.text));
  emit("evaluate", { scores });

  const action = decideAction(scores, deps.thresholds);
  emit("action", { action });

  let internal = "";
  let web = "";

  if (action === "correct" || action === "ambiguous") {
    internal = await refineAll(query, retrieved, deps.evaluator, deps.keepThreshold);
    emit("refine_internal", { length: internal.length });
  }

  if (action === "incorrect" || action === "ambiguous") {
    const kw = await deps.rewriteQuery(query);
    emit("query_rewrite", { kw });
    const webChunks = await deps.webSearch(kw);
    emit("web_search", { count: webChunks.length });
    web = await refineAll(query, webChunks, deps.evaluator, deps.keepThreshold);
    emit("refine_web", { length: web.length });
  }

  const context = [internal, web].filter((s) => s.length > 0).join("\n\n");
  emit("context_ready", { length: context.length });

  return { action, context, scores, retrieved };
}
