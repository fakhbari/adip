// OpenAI provider. /v1/chat/completions and /v1/embeddings via raw fetch.
// Compatible with self-hosted OpenAI-shape endpoints (Azure OpenAI,
// LM Studio, etc.) by overriding baseUrl.

import type { LLMProvider } from "./provider";
import type {
  ChatDelta,
  ChatMessage,
  ChatOptions,
  ChatResult,
  EmbedOptions,
  EmbedResult,
  TokenUsage,
} from "./types";
import { recordUsage } from "./usage-tracker";
import { iterateSSE } from "./stream-parsers";

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

  /**
   * Polish P4.2 — streaming chat. SSE on /chat/completions with
   * `stream:true`. `stream_options.include_usage:true` makes the
   * final frame carry token usage so we can still record LLMUsage.
   */
  async *stream(messages: ChatMessage[], opts?: ChatOptions): AsyncGenerator<ChatDelta> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: opts?.maxTokens ?? this.defaultMaxTokens,
        temperature: opts?.temperature ?? this.defaultTemperature,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI stream ${res.status}: ${detail.slice(0, 500)}`);
    }

    let totalUsage: TokenUsage | undefined;

    for await (const frame of iterateSSE(res)) {
      const choice = (frame.choices as Array<{
        delta?: { content?: string };
        finish_reason?: string;
      }>)?.[0];
      if (choice?.delta?.content) {
        yield { delta: choice.delta.content };
      }
      if (choice?.finish_reason) {
        // Wait — final usage frame may follow with empty choices but a
        // populated `usage` field. Don't yield finish here yet; we
        // surface it on the very last frame below.
      }
      if (frame.usage) {
        const u = frame.usage as { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        totalUsage = {
          promptTokens: u.prompt_tokens,
          completionTokens: u.completion_tokens,
          totalTokens: u.total_tokens,
        };
      }
    }

    if (totalUsage) {
      await recordUsage({
        provider: this.kind,
        model: this.model,
        usage: totalUsage,
        analysisRunId: opts?.meta?.analysisRunId as string | undefined,
        repositoryId: opts?.meta?.repositoryId as string | undefined,
        agentType: opts?.meta?.agentType as string | undefined,
      });
    }
    yield { delta: "", finish: "stop", usage: totalUsage };
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
