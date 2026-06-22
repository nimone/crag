import "../src/lib/env"; // ensures .env.local is loaded
import { query, getPool } from "@/lib/db";

async function main() {
  try {
    // 1. Check table exists and row count
    const count = await query<{ count: number }>(
      "SELECT count(*)::int as count FROM filing_chunks",
    );
    console.log(`filing_chunks rows: ${count[0]?.count ?? "—"}`);

    // 2. Check function exists
    const fn = await query<{ exists: boolean }>(
      "SELECT count(*)::int > 0 as exists FROM pg_proc WHERE proname = 'match_chunks'",
    );
    console.log(`match_chunks exists: ${fn[0]?.exists}`);

    // 3. Test with a real embedding from the table
    const sample = await query<{ emb: string }>(
      "SELECT embedding::text as emb FROM filing_chunks LIMIT 1",
    );
    if (sample.length > 0) {
      const test = await query<{ id: string; similarity: number }>(
        "SELECT id, similarity FROM match_chunks($1::vector(1024), 3)",
        [sample[0].emb],
      );
      console.log(`match_chunks(real_embedding, 3) returned ${test.length} rows`);
      if (test.length > 0) {
        console.log(`  top: similarity=${test[0].similarity} id=${test[0].id}`);
      }
    }
  } catch (err) {
    console.error("DIAGNOSTIC FAILED:", err instanceof Error ? err.message : String(err));
  } finally {
    await getPool().end();
  }
}

main();
