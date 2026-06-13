import { streamText } from "ai";
import { openrouter } from "@/lib/llm/model";
import { runCrag } from "@/lib/crag/pipeline";
import { buildCragDeps } from "@/lib/crag/from-env";
import { getEnv } from "@/lib/env";
import { makeLangfuse } from "@/lib/observability/langfuse";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel function timeout (seconds)

export async function POST(req: Request) {
  const { query, evaluator = "cohere" } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      // Langfuse tracing
      let lf: ReturnType<typeof makeLangfuse> | null = null;
      let trace: ReturnType<typeof lf.trace> | null = null;
      try {
        lf = makeLangfuse();
        trace = lf.trace({ name: "crag-query", input: { query } });
      } catch {
        // Langfuse env vars not set — skip tracing
      }

      const deps = buildCragDeps(evaluator, (e) => {
        send({ type: "trace", ...e });
        if (trace) {
          try {
            trace.event({ name: e.step, metadata: (e as { data?: unknown }).data });
          } catch {
            // ignore tracing errors
          }
        }
      });

      const result = await runCrag(query, deps);
      send({ type: "result_meta", action: result.action, scores: result.scores });

      if (trace) {
        try {
          trace.update({ output: { action: result.action } });
        } catch {
          // ignore
        }
      }

      const { textStream } = streamText({
        model: openrouter(getEnv("GEN_MODEL")),
        prompt:
          `Answer the QUESTION using only the CONTEXT. Cite sources. ` +
          `If the context is insufficient, say so.\n` +
          `CONTEXT:\n${result.context}\n\nQUESTION: ${query}`,
      });
      for await (const delta of textStream) send({ type: "token", delta });
      send({ type: "done" });

      if (lf) {
        try {
          await lf.flushAsync();
        } catch {
          // ignore
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}
