export interface ChunkMetadata {
  company: string;
  filingType: "10-K" | "10-Q" | "web";
  fiscalPeriod: string;
  section: string;
  url: string;
}

export interface Chunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

export interface ScoredChunk extends Chunk {
  score: number; // normalized relevance, 0..1
}

export type CragAction = "correct" | "incorrect" | "ambiguous";

export interface KnowledgeStrip {
  text: string;
  score: number;
  source: "internal" | "web";
}

export interface CragTraceEvent {
  step: string;
  data: unknown;
}
