import { test, expect, describe } from "bun:test";
import { chunkText } from "@/lib/ingest/chunk";

describe("chunkText", () => {
  test("splits into overlapping windows by word count", () => {
    const words = Array.from({ length: 250 }, (_, i) => `w${i}`).join(" ");
    const chunks = chunkText(words, { size: 100, overlap: 20 });
    expect(chunks.length).toBe(3); // 0-100, 80-180, 160-250
    expect(chunks[0].split(" ").length).toBe(100);
    // overlap: last 20 words of chunk0 are first 20 of chunk1
    expect(chunks[1].startsWith("w80 ")).toBe(true);
  });
  test("short text -> single chunk", () => {
    expect(chunkText("a b c", { size: 100, overlap: 20 })).toEqual(["a b c"]);
  });
});
