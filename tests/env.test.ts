import { test, expect } from "bun:test";
import { getEnv } from "@/lib/env";

test("getEnv returns a present var", () => {
  process.env.FOO_TEST = "bar";
  expect(getEnv("FOO_TEST")).toBe("bar");
});

test("getEnv throws a clear error when missing", () => {
  delete process.env.MISSING_TEST;
  expect(() => getEnv("MISSING_TEST")).toThrow("Missing required env var: MISSING_TEST");
});
