import { Langfuse } from "langfuse";
import { getEnv } from "@/lib/env";

export function makeLangfuse() {
  return new Langfuse({
    publicKey: getEnv("LANGFUSE_PUBLIC_KEY"),
    secretKey: getEnv("LANGFUSE_SECRET_KEY"),
    baseUrl:
      process.env.LANGFUSE_BASE_URL ??
      process.env.LANGFUSE_BASEURL ??
      "https://cloud.langfuse.com",
  });
}
