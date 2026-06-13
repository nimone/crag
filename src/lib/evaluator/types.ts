export interface Evaluator {
  /** Human-readable id used in traces and benchmarks. */
  name: string;
  /** Returns a relevance score in [0,1] for each doc, aligned to input order. */
  score(query: string, docs: string[]): Promise<number[]>;
}
