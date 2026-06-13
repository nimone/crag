import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import { fetchFiling } from "@/lib/ingest/edgar";
import { chunkText } from "@/lib/ingest/chunk";
import { cohereEmbedderFromEnv } from "@/lib/embeddings/cohere";
import filings from "./filings.json";

const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
const embed = cohereEmbedderFromEnv();

for (const f of filings) {
  console.log(`Fetching ${f.company} ${f.filingType}...`);
  const text = await fetchFiling(f.url);
  const chunks = chunkText(text, { size: 350, overlap: 50 });
  console.log(`  ${chunks.length} chunks; embedding...`);
  // Cohere embed: batch in groups of 96 (API limit)
  for (let i = 0; i < chunks.length; i += 96) {
    const batch = chunks.slice(i, i + 96);
    const vectors = await embed(batch, "search_document");
    const rows = batch.map((t, j) => ({
      id: `${f.company}-${f.fiscalPeriod}-${i + j}`,
      text: t,
      company: f.company,
      filing_type: f.filingType,
      fiscal_period: f.fiscalPeriod,
      section: "body",
      url: f.url,
      embedding: vectors[j],
    }));
    const { error } = await supabase.from("filing_chunks").upsert(rows);
    if (error) throw new Error(error.message);
    console.log(`  upserted ${i + batch.length}/${chunks.length}`);
  }
}
console.log("Ingestion complete.");
