import { test, expect } from "bun:test";
import { stripHtml } from "@/lib/ingest/edgar";

test("stripHtml removes tags and collapses whitespace", () => {
  const html = "<div>Revenue was <b>$100</b>.<script>x()</script></div>\n<p>Risk.</p>";
  expect(stripHtml(html)).toBe("Revenue was $100. Risk.");
});
