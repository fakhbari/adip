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
