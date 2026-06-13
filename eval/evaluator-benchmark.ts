import { cohereEvaluatorFromEnv } from "@/lib/evaluator/cohere-reranker";
import { llmJudgeFromEnv } from "@/lib/evaluator/llm-judge";

const rows = (await Bun.file("eval/data/relevance.jsonl").text())
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as { query: string; doc: string; relevant: boolean });

const THRESH = 0.5;
for (const [name, ev] of [
  ["cohere", cohereEvaluatorFromEnv()],
  ["llm-judge", llmJudgeFromEnv()],
] as const) {
  const t0 = performance.now();
  let correct = 0;
  for (const r of rows) {
    const [score] = await ev.score(r.query, [r.doc]);
    const predicted = score >= THRESH;
    if (predicted === r.relevant) correct++;
  }
  const ms = performance.now() - t0;
  console.log(
    `${name}: accuracy=${(correct / rows.length).toFixed(3)} latency=${(ms / rows.length).toFixed(1)}ms/doc`,
  );
}
