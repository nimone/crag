import { test, expect } from "bun:test";

test("buildCragDeps reads thresholds from env and defaults to Jina evaluator", async () => {
  process.env.CRAG_UPPER_THRESHOLD = "0.8";
  process.env.CRAG_LOWER_THRESHOLD = "0.2";
  process.env.OPENROUTER_API_KEY = "k";
  process.env.JINA_API_KEY = "k";
  process.env.TAVILY_API_KEY = "k";
  process.env.DB_URL = "postgresql://localhost/mydb";
  process.env.JUDGE_MODEL = "m";
  const { buildCragDeps } = await import("@/lib/crag/from-env");
  const deps = buildCragDeps("jina");
  expect(deps.thresholds).toEqual({ upper: 0.8, lower: 0.2 });
  expect(deps.evaluator.name).toContain("jina");
});
