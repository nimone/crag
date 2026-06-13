import { test, expect } from "bun:test";

test("openrouter factory is configured from env and returns a model for an id", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  // Use dynamic import to ensure the env var is set before module init
  const mod = await import("@/lib/llm/model");
  const model = mod.openrouter("anthropic/claude-haiku-4-5-20251001");
  expect(model).toBeDefined();
  expect(typeof model).toBe("object");
});
