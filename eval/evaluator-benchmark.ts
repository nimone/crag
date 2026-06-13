import { cohereEvaluatorFromEnv } from "@/lib/evaluator/cohere-reranker";
import { llmJudgeFromEnv } from "@/lib/evaluator/llm-judge";
import { jinaRerankerFromEnv } from "@/lib/evaluator/jina-reranker";

const rows = (await Bun.file("eval/data/relevance.jsonl").text())
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as { query: string; doc: string; relevant: boolean });

// Group rows by query to leverage batching and minimize API calls (prevent 429s)
const groupsMap = new Map<string, { doc: string; relevant: boolean }[]>();
for (const r of rows) {
  if (!groupsMap.has(r.query)) {
    groupsMap.set(r.query, []);
  }
  groupsMap.get(r.query)!.push({ doc: r.doc, relevant: r.relevant });
}

const THRESH = 0.5;
for (const [name, ev] of [
  ["jina", jinaRerankerFromEnv()],
  ["cohere", cohereEvaluatorFromEnv()],
  ["llm-judge", llmJudgeFromEnv()],
] as const) {
  const t0 = performance.now();
  let correct = 0;
  for (const [query, groupRows] of groupsMap.entries()) {
    const docs = groupRows.map((gr) => gr.doc);
    const scores = await ev.score(query, docs);
    for (let i = 0; i < groupRows.length; i++) {
      const predicted = scores[i] >= THRESH;
      if (predicted === groupRows[i].relevant) correct++;
    }
  }
  const ms = performance.now() - t0;
  console.log(
    `${name}: accuracy=${(correct / rows.length).toFixed(3)} latency=${(ms / rows.length).toFixed(1)}ms/doc`,
  );
}

