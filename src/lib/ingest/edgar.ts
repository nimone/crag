export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// SEC requires a descriptive User-Agent. See https://www.sec.gov/os/webmaster-faq#developers
const UA = "corrective-rag-demo contact@example.com";

export async function fetchFiling(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const res = await fetchFn(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`EDGAR fetch failed ${res.status} for ${url}`);
  return stripHtml(await res.text());
}
