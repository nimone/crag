import type { Chunk } from "@/lib/types";
import { getEnv, getNumberEnv } from "@/lib/env";
import { jinaEmbedderFromEnv } from "@/lib/embeddings/jina";
import { query } from "@/lib/db";

type Embedder = (texts: string[], inputType: "search_query") => Promise<number[][]>;

type MatchChunkRow = {
  id: string;
  text: string;
  company: string;
  filing_type: string;
  fiscal_period: string;
  section: string;
  url: string;
  similarity: number;
};

export function makeRetriever(dbg: typeof query, embed: Embedder, topK: number) {
  return async (queryText: string): Promise<Chunk[]> => {
    const [embedding] = await embed([queryText], "search_query");
    const rows = await dbg<MatchChunkRow>(
      "SELECT * FROM match_chunks($1::vector(1024), $2::int)",
      [`[${embedding.join(",")}]`, topK],
    );
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      metadata: {
        company: r.company,
        filingType: r.filing_type as Chunk["metadata"]["filingType"],
        fiscalPeriod: r.fiscal_period,
        section: r.section,
        url: r.url,
      },
    }));
  };
}

export function retrieverFromEnv() {
  getEnv("DB_URL");
  const embedder = jinaEmbedderFromEnv();
  const embed: Embedder = (texts, inputType) => embedder(texts, inputType);
  return makeRetriever(query, embed, getNumberEnv("CRAG_TOP_K", 5));
}
