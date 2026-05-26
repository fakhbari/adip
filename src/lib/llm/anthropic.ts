// Anthropic Claude provider. Uses the official `/v1/messages` REST API
// directly (no SDK) to keep the dep footprint small and the bundle
// offline-friendly.

import type { LLMProvider } from "./provider";
import type { ChatMessage, ChatOptions, ChatResult, TokenUsage } from "./types";
import { recordUsage } from "./usage-tracker";

const DEFAULT_BASE_URL = "https://api.anthropic.com";

export class AnthropicProvider implements LLMProvider {
  readonly kind = "anthropic";
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultMaxTokens: number;
  private readonly defaultTemperature: number;

  constructor(opts: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
  }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.defaultMaxTokens = opts.maxTokens ?? 4096;
    this.defaultTemperature = opts.temperature ?? 0.7;
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
    // Anthropic separates the system prompt from the messages array.
    const systemMessages = messages.filter((m) => m.role === "system").map((m) => m.content);
    const turns = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        system: systemMessages.length > 0 ? systemMessages.join("\n\n") : undefined,
        messages: turns,
        max_tokens: opts?.maxTokens ?? this.defaultMaxTokens,
        temperature: opts?.temperature ?? this.defaultTemperature,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
      stop_reason?: string;
    };

    const content = data.content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");

    const usage: TokenUsage = {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
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
      content,
      usage,
      finishReason: data.stop_reason === "end_turn" ? "stop" : (data.stop_reason as ChatResult["finishReason"] | undefined) ?? "unknown",
    };
  }
}
