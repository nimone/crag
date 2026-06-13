import { test, expect } from "bun:test";
import type { CragAction } from "@/lib/types";

test("smoke: types load", () => {
  const a: CragAction = "correct";
  expect(a).toBe("correct");
});
