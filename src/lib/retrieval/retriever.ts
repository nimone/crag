import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Chunk } from "@/lib/types";
import { getEnv, getNumberEnv } from "@/lib/env";
import { jinaEmbedderFromEnv } from "@/lib/embeddings/jina";

type Embedder = (texts: string[], inputType: "search_query") => Promise<number[][]>;

export function makeRetriever(supabase: SupabaseClient, embed: Embedder, topK: number) {
  return async (query: string): Promise<Chunk[]> => {
    const [embedding] = await embed([query], "search_query");
    const { data, error } = await supabase.rpc("match_chunks", {
      query_embedding: embedding,
      match_count: topK,
    });
    if (error) throw new Error(`match_chunks failed: ${error.message}`);
    return (data ?? []).map((r: {
      id: string;
      text: string;
      company: string;
      filing_type: string;
      fiscal_period: string;
      section: string;
      url: string;
    }) => ({
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
  const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const embedder = jinaEmbedderFromEnv();
  const embed: Embedder = (texts, inputType) => embedder(texts, inputType);
  return makeRetriever(supabase, embed, getNumberEnv("CRAG_TOP_K", 5));
}
