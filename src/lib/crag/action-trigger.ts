import type { CragAction } from "@/lib/types";

export interface Thresholds {
  upper: number;
  lower: number;
}

export function decideAction(scores: number[], t: Thresholds): CragAction {
  const top = scores.length ? Math.max(...scores) : 0;
  if (top >= t.upper) return "correct";
  if (top < t.lower) return "incorrect";
  return "ambiguous";
}
