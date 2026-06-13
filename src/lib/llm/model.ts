/** Returns an AI SDK LanguageModel for the given OpenRouter model id. */
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getEnv } from "@/lib/env";

let _provider: ReturnType<typeof createOpenRouter> | null = null;

function getProvider() {
  if (!_provider) {
    _provider = createOpenRouter({ apiKey: getEnv("OPENROUTER_API_KEY") });
  }
  return _provider;
}

export const openrouter = (modelId: string) => getProvider()(modelId);
