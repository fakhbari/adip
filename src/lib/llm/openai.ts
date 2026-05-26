// OpenAI provider. /v1/chat/completions and /v1/embeddings via raw fetch.
// Compatible with self-hosted OpenAI-shape endpoints (Azure OpenAI,
// LM Studio, etc.) by overriding baseUrl.

import type { LLMProvider } from "./provider";
import type {
  ChatMessage,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
  TokenUsage,
} from "./types";
import { recordUsage } from "./usage-tracker";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export class OpenAIProvider implements LLMProvider {
  readonly kind = "openai";
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultMaxTokens: number;
  private readonly defaultTemperature: number;
  private readonly embedModel: string;

  constructor(opts: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
    embedModel?: string;
  }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.defaultMaxTokens = opts.maxTokens ?? 4096;
    this.defaultTemperature = opts.temperature ?? 0.7;
    this.embedModel = opts.embedModel ?? "text-embedding-3-small";
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: opts?.maxTokens ?? this.defaultMaxTokens,
        temperature: opts?.temperature ?? this.defaultTemperature,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string }; finish_reason?: string }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const usage: TokenUsage = {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    };

    await recordUsage({
      provider: this.kind,
      model: this.model,
      usage,
      analysisRunId: opts?.meta?.analysisRunId as string | undefined,
      repositoryId: opts?.meta?.repositoryId as string | undefined,
      agentType: opts?.meta?.agentType as string | undefined,
    });

    return {
      content: data.choices[0]?.message?.content ?? "",
      usage,
      finishReason: (data.choices[0]?.finish_reason as ChatResult["finishReason"]) ?? "unknown",
    };
  }

  async embed(texts: string[], _opts?: EmbedOptions): Promise<EmbedResult> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.embedModel, input: texts }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI embed ${res.status}: ${detail.slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      data: Array<{ embedding: number[] }>;
      usage: { total_tokens: number };
    };
    return { embeddings: data.data.map((d) => d.embedding), usage: { totalTokens: data.usage.total_tokens } };
  }
}
