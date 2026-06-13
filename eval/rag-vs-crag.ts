import { runCrag } from "@/lib/crag/pipeline";
import { buildCragDeps } from "@/lib/crag/from-env";
import { generateText } from "ai";
import { openrouter } from "@/lib/llm/model";
import { getEnv } from "@/lib/env";

const rows = (await Bun.file("eval/data/qa.jsonl").text())
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l) as { query: string; expected: string });

const deps = buildCragDeps("jina");
const gen = (ctx: string, q: string) =>
  generateText({
    model: openrouter(getEnv("GEN_MODEL")),
    prompt: `Answer using only CONTEXT.\nCONTEXT:\n${ctx}\n\nQUESTION: ${q}`,
  }).then((r) => r.text);

let cragHits = 0, ragHits = 0;
for (const r of rows) {
  // CRAG (with correction)
  const crag = await runCrag(r.query, deps);
  const cragAns = await gen(crag.context, r.query);
  // vanilla RAG: top-k context, no grading/correction
  const ragCtx = crag.retrieved.map((c) => c.text).join("\n\n");
  const ragAns = await gen(ragCtx, r.query);

  const contains = (a: string) => r.expected !== "WEB_FALLBACK" && a.includes(r.expected);
  if (r.expected === "WEB_FALLBACK" ? crag.action === "incorrect" : contains(cragAns)) cragHits++;
  if (contains(ragAns)) ragHits++;
  console.log(`Q: ${r.query}\n  CRAG[${crag.action}]: ${cragAns.slice(0, 80)}\n  RAG: ${ragAns.slice(0, 80)}`);
}
console.log(`CRAG: ${cragHits}/${rows.length}  RAG: ${ragHits}/${rows.length}`);
