import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import { fetchFiling } from "@/lib/ingest/edgar";
import { chunkText } from "@/lib/ingest/chunk";
import { jinaEmbedderFromEnv } from "@/lib/embeddings/jina";
import filings from "./filings.json";

const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
const embed = jinaEmbedderFromEnv();

/** Sleep for `ms` milliseconds. */
const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/**
 * Calls `fn` and retries on 429 TooManyRequests with exponential backoff.
 * Parses the retry-after header if present, otherwise uses `baseDelayMs * 2^attempt`.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  opts = { maxAttempts: 6, baseDelayMs: 10_000 },
): Promise<T> {
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const is429 =
        (err as { statusCode?: number })?.statusCode === 429 ||
        (err as { status?: number })?.status === 429 ||
        String(err).includes("429") ||
        String(err).includes("TooManyRequests") ||
        String(err).includes("rate limit");

      if (!is429 || attempt === opts.maxAttempts - 1) throw err;

      // Try to honour Retry-After header (in seconds), else exponential backoff
      const retryAfterSec =
        (err as { rawResponse?: { headers?: { get?: (k: string) => string | null } } })
          ?.rawResponse?.headers?.get?.("retry-after");
      const delayMs = retryAfterSec
        ? Number(retryAfterSec) * 1_000
        : opts.baseDelayMs * 2 ** attempt;

      console.warn(
        `  ⚠️  429 rate-limit hit (attempt ${attempt + 1}/${opts.maxAttempts}). ` +
          `Waiting ${(delayMs / 1000).toFixed(1)}s before retry…`,
      );
      await sleep(delayMs);
    }
  }
  // unreachable, but satisfies TypeScript
  throw new Error("withRetry exhausted all attempts");
}

for (const f of filings) {
  console.log(`\nFetching ${f.company} ${f.filingType}…`);
  const text = await fetchFiling(f.url);
  const chunks = chunkText(text, { size: 350, overlap: 50 });
  console.log(`  ${chunks.length} chunks to embed and upsert`);

  // Cohere embed: batch in groups of 96 (API limit)
  for (let i = 0; i < chunks.length; i += 96) {
    const batch = chunks.slice(i, i + 96);
    const batchNum = Math.floor(i / 96) + 1;
    const totalBatches = Math.ceil(chunks.length / 96);

    console.log(`  batch ${batchNum}/${totalBatches} (chunks ${i + 1}–${i + batch.length})`);

    const vectors = await withRetry(() => embed(batch, "search_document"));

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

    console.log(`  ✓ upserted ${i + batch.length}/${chunks.length}`);

    // Small pause between batches. Jina's free tier is generous; 2s is enough
    // to be polite without slowing down ingestion noticeably.
    if (i + 96 < chunks.length) {
      const pauseMs = 2_000;
      console.log(`  ⏳ pausing ${pauseMs / 1000}s…`);
      await sleep(pauseMs);
    }
  }
}

console.log("\n✅ Ingestion complete.");
