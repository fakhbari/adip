// LLMProvider — the one interface every agent talks to.
//
// Implementations live as siblings (anthropic.ts, openai.ts, ollama.ts,
// vllm.ts). The factory in src/lib/llm/index.ts picks one based on
// the AIProvider DB row that the orchestrator resolves at boot.

import type { ChatMessage, ChatOptions, ChatResult, EmbedOptions, EmbedResult } from "./types";

export interface LLMProvider {
  /** Provider key — "anthropic" | "openai" | "ollama" | "vllm". */
  readonly kind: string;
  /** Human-friendly model identifier. */
  readonly model: string;

  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;

  /** Optional — only required when the agent uses RAG. */
  embed?(texts: string[], opts?: EmbedOptions): Promise<EmbedResult>;
}
