// vLLM provider — delegates to a vLLM server (typically run as the
// Python sidecar `adip-graph` in Phase 2.7) over its OpenAI-shape
// HTTP surface.
//
// Implemented as its own class (not a subclass of OpenAIProvider) so
// the `kind` literal can be "vllm" without TypeScript fighting us
// over readonly-property narrowing across the inheritance chain.

import type { LLMProvider } from "./provider";
import { OpenAIProvider } from "./openai";
import type { ChatMessage, ChatOptions, ChatResult, EmbedOptions, EmbedResult } from "./types";

const DEFAULT_BASE_URL = process.env.ADIP_SIDECAR_URL ?? "http://localhost:8080/v1";

export class VllmProvider implements LLMProvider {
  readonly kind = "vllm";
  readonly model: string;
  private readonly inner: OpenAIProvider;

  constructor(opts: {
    apiKey?: string;
    model: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
  }) {
    this.model = opts.model;
    this.inner = new OpenAIProvider({
      apiKey: opts.apiKey ?? "vllm",
      model: opts.model,
      baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
  }

  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
    return this.inner.chat(messages, opts);
  }

  embed(texts: string[], opts?: EmbedOptions): Promise<EmbedResult> {
    return this.inner.embed(texts, opts);
  }
}
