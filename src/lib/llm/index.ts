// LLM provider factory.
//
// Given an `AIProvider` Prisma row (already decrypted), return the
// concrete adapter. Caller is responsible for decrypting `apiKey` via
// `decryptOptional()` before passing the row in.

import type { AIProvider, AIProviderType } from "@prisma/client";
import type { LLMProvider } from "./provider";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { OllamaProvider } from "./ollama";
import { VllmProvider } from "./vllm";

export { type LLMProvider } from "./provider";
export type { ChatMessage, ChatOptions, ChatResult, TokenUsage, EmbedResult } from "./types";

export type AIProviderWithDecryptedKey = Omit<AIProvider, "apiKey"> & { apiKey: string | null };

export function createLLMProvider(provider: AIProviderWithDecryptedKey): LLMProvider {
  const type: AIProviderType = provider.type;
  const maxTokens = provider.maxTokens;
  const temperature = provider.temperature;
  const model = provider.modelName;
  const baseUrl = provider.baseUrl ?? undefined;
  const apiKey = provider.apiKey ?? "";

  switch (type) {
    case "ANTHROPIC":
      if (!apiKey) throw new Error("Anthropic provider requires an apiKey");
      return new AnthropicProvider({ apiKey, model, baseUrl, maxTokens, temperature });
    case "OPENAI":
    case "AZURE_OPENAI":
      if (!apiKey) throw new Error("OpenAI-shape provider requires an apiKey");
      return new OpenAIProvider({ apiKey, model, baseUrl, maxTokens, temperature });
    case "LOCAL_OLLAMA":
      return new OllamaProvider({ model, baseUrl, temperature });
    case "CUSTOM":
      // CUSTOM is treated as either vLLM (if baseUrl points at an
      // OpenAI-shape server) or OpenAI-compatible. Default to vLLM
      // since that's the proposal's local-OSS path.
      return new VllmProvider({ apiKey: apiKey || undefined, model, baseUrl, maxTokens, temperature });
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown AIProvider type: ${String(_exhaustive)}`);
    }
  }
}
