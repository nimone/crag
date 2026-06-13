import { CohereClient } from "cohere-ai";
import { getEnv } from "@/lib/env";

type InputType = "search_document" | "search_query";

interface EmbedClient {
  embed(args: { model: string; texts: string[]; inputType: InputType }): Promise<{
    embeddings: number[][];
  }>;
}

export function makeCohereEmbedder(client: EmbedClient, model = "embed-english-v3.0") {
  return async (texts: string[], inputType: InputType): Promise<number[][]> => {
    if (texts.length === 0) return [];
    const res = await client.embed({ model, texts, inputType });
    return res.embeddings;
  };
}

export function cohereEmbedderFromEnv() {
  const client = new CohereClient({ token: getEnv("COHERE_API_KEY") });
  return makeCohereEmbedder(client as unknown as EmbedClient);
}
