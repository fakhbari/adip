// Provider-neutral LLM types. The shape is deliberately small — a
// chat message and a usage record. Adapters translate to/from each
// vendor's wire format.

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatOptions {
  /** Hard cap on output tokens. Falls back to the AIProvider record's maxTokens. */
  maxTokens?: number;
  /** Sampling temperature. Falls back to AIProvider.temperature. */
  temperature?: number;
  /** Identifier of the analysisRun, repositoryId, agent etc — recorded in LLMUsage. */
  meta?: Record<string, string | number | undefined>;
}

export interface ChatResult {
  content: string;
  usage: TokenUsage;
  finishReason?: "stop" | "length" | "content_filter" | "error" | "unknown";
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface EmbedOptions {
  meta?: Record<string, string | number | undefined>;
}

export interface EmbedResult {
  embeddings: number[][];
  usage: { totalTokens: number };
}

/**
 * Polish P4.2 — streaming chat delta. Emitted from `LLMProvider.stream()`
 * for callers that want to forward chunks to the UI (live log page) or
 * persist them as `llm-delta` RunEvents.
 *
 *   - `delta` is the text fragment for this chunk.
 *   - `finish` is set only on the LAST event of a stream.
 *   - `usage` is populated on the final frame when the provider supplies it
 *     (OpenAI does when `stream_options.include_usage: true`; Anthropic
 *     emits a `message_delta` with usage; Ollama emits on the `done` row).
 */
export interface ChatDelta {
  delta: string;
  finish?: ChatResult["finishReason"];
  usage?: Partial<TokenUsage>;
}
