import type { Chunk } from "@/lib/types";
import { getEnv } from "@/lib/env";

interface TavilyResult { title: string; content: string; url: string }

export function makeWebSearch(apiKey: string, fetchFn: typeof fetch = fetch) {
  return async (query: string): Promise<Chunk[]> => {
    const res = await fetchFn("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 5,
      }),
    });
    if (!res.ok) throw new Error(`Tavily error ${res.status}`);
    const data = (await res.json()) as { results: TavilyResult[] };
    return data.results.map((r, i) => ({
      id: `web-${i}`,
      text: r.content,
      metadata: { company: "WEB", filingType: "web" as const, fiscalPeriod: "", section: r.title, url: r.url },
    }));
  };
}

export function webSearchFromEnv() {
  return makeWebSearch(getEnv("TAVILY_API_KEY"));
}
