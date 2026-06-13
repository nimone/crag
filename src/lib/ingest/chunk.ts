export function chunkText(text: string, opts: { size: number; overlap: number }): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= opts.size) return words.length ? [words.join(" ")] : [];
  const step = opts.size - opts.overlap;
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    chunks.push(words.slice(start, start + opts.size).join(" "));
    if (start + opts.size >= words.length) break;
  }
  return chunks;
}
