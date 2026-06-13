import { generateText } from "ai";
import { openrouter } from "@/lib/llm/model";
import { getEnv } from "@/lib/env";

export type GenerateFn = (prompt: string) => Promise<string>;

export function makeQueryRewriter(gen: GenerateFn) {
  return async (query: string): Promise<string> => {
    const raw = await gen(
      `Rewrite the question as a short keyword web-search query. ` +
        `Return only keywords, no punctuation.\nQUESTION: ${query}`,
    );
    return raw.replace(/\s+/g, " ").trim();
  };
}

export function queryRewriterFromEnv() {
  const model = getEnv("JUDGE_MODEL");
  const gen: GenerateFn = async (prompt) => {
    const { text } = await generateText({ model: openrouter(model), prompt });
    return text;
  };
  return makeQueryRewriter(gen);
}
