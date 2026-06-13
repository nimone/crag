import type { Evaluator } from "@/lib/evaluator/types";

export function splitIntoStrips(text: string): string[] {
  // Mask decimals (e.g., 47.5 -> 47__DECIMAL__5) to prevent sentence splitting on numbers
  let masked = text.replace(/(\d)\.(\d)/g, "$1__DECIMAL__$2");
  
  // Mask common abbreviations
  const abbreviations = ["Inc.", "Corp.", "Co.", "Ltd.", "U.S.", "vs.", "Jan.", "Feb.", "Mar.", "Apr.", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
  for (const abbrev of abbreviations) {
    const regex = new RegExp(`\\b${abbrev.replace(".", "\\.")}`, "gi");
    masked = masked.replace(regex, abbrev.replace(".", "__ABBREV__"));
  }

  // Split on sentence terminators
  const fragments = masked
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((s) => s.trim())
    .filter((s) => s.length > 0) ?? [];

  // Unmask decimals and abbreviations
  return fragments.map((f) => {
    let unmasked = f.replace(/__DECIMAL__/g, ".");
    for (const abbrev of abbreviations) {
      unmasked = unmasked.replace(new RegExp(abbrev.replace(".", "__ABBREV__"), "gi"), abbrev);
    }
    return unmasked;
  });
}

export async function recompose(
  query: string,
  text: string,
  evaluator: Evaluator,
  keepThreshold: number,
): Promise<string> {
  const strips = splitIntoStrips(text);
  if (strips.length === 0) return "";
  const scores = await evaluator.score(query, strips);
  return strips
    .filter((_, i) => scores[i] >= keepThreshold)
    .join(" ");
}
