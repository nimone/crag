import { test, expect } from "bun:test";

test("buildCragDeps reads thresholds from env", async () => {
  process.env.CRAG_UPPER_THRESHOLD = "0.8";
  process.env.CRAG_LOWER_THRESHOLD = "0.2";
  process.env.OPENROUTER_API_KEY = "k";
  process.env.COHERE_API_KEY = "k";
  process.env.TAVILY_API_KEY = "k";
  process.env.SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  process.env.JUDGE_MODEL = "m";
  const { buildCragDeps } = await import("@/lib/crag/from-env");
  const deps = buildCragDeps("cohere");
  expect(deps.thresholds).toEqual({ upper: 0.8, lower: 0.2 });
  expect(deps.evaluator.name).toContain("cohere");
});
