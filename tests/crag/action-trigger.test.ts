import { test, expect, describe } from "bun:test";
import { decideAction } from "@/lib/crag/action-trigger";

const t = { upper: 0.7, lower: 0.3 };

describe("decideAction", () => {
  test("correct when top score >= upper", () => {
    expect(decideAction([0.2, 0.9, 0.5], t)).toBe("correct");
  });
  test("incorrect when top score < lower", () => {
    expect(decideAction([0.1, 0.25], t)).toBe("incorrect");
  });
  test("ambiguous when top score between thresholds", () => {
    expect(decideAction([0.5, 0.4], t)).toBe("ambiguous");
  });
  test("incorrect when no scores", () => {
    expect(decideAction([], t)).toBe("incorrect");
  });
});
