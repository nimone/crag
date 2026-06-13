import type { Evaluator } from "@/lib/evaluator/types";

export function splitIntoStrips(text: string): string[] {
  return (
    text
      .replace(/\s+/g, " ")
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter((s) => s.length > 0) ?? []
  );
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
