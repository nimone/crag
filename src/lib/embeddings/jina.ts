import { getEnv } from "@/lib/env";

type JinaTask = "retrieval.passage" | "retrieval.query";

interface JinaEmbedRequest {
  model: string;
  input: string[];
  task: JinaTask;
  dimensions?: number;
}

interface JinaEmbedResponse {
  data: { index: number; embedding: number[] }[];
}

export function makeJinaEmbedder(
  apiKey: string,
  model = "jina-embeddings-v3",
  fetchFn: typeof fetch = fetch,
) {
  return async (texts: string[], task: "search_document" | "search_query"): Promise<number[][]> => {
    if (texts.length === 0) return [];

    const jinaTask: JinaTask =
      task === "search_query" ? "retrieval.query" : "retrieval.passage";

    const res = await fetchFn("https://api.jina.ai/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts,
        task: jinaTask,
        dimensions: 1024, // match pgvector schema
      } satisfies JinaEmbedRequest),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Jina embed error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as JinaEmbedResponse;
    // Results may arrive out of order — sort by index before returning
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  };
}

export function jinaEmbedderFromEnv() {
  return makeJinaEmbedder(getEnv("JINA_API_KEY"));
}
