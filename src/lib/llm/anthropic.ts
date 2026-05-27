// Anthropic Claude provider. Uses the official `/v1/messages` REST API
// directly (no SDK) to keep the dep footprint small and the bundle
// offline-friendly.

import type { LLMProvider } from "./provider";
import type { ChatDelta, ChatMessage, ChatOptions, ChatResult, TokenUsage } from "./types";
import { recordUsage } from "./usage-tracker";
import { iterateSSE } from "./stream-parsers";

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

  /**
   * Polish P4.2 — Anthropic streaming. SSE on /v1/messages with
   * stream:true. Frames of interest:
   *   content_block_delta { delta: { type:"text_delta", text } }
   *   message_delta       { usage: { output_tokens } }
   *   message_start       { message: { usage: { input_tokens } } }
   */
  async *stream(messages: ChatMessage[], opts?: ChatOptions): AsyncGenerator<ChatDelta> {
    const systemMessages = messages.filter((m) => m.role === "system").map((m) => m.content);
    const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: this.model,
        system: systemMessages.length > 0 ? systemMessages.join("\n\n") : undefined,
        messages: turns,
        max_tokens: opts?.maxTokens ?? this.defaultMaxTokens,
        temperature: opts?.temperature ?? this.defaultTemperature,
        stream: true,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic stream ${res.status}: ${detail.slice(0, 500)}`);
    }

    let promptTokens = 0;
    let completionTokens = 0;
    let stopReason: string | undefined;

    for await (const frame of iterateSSE(res)) {
      const t = frame.type as string | undefined;
      if (t === "message_start") {
        const u = (frame.message as { usage?: { input_tokens?: number } } | undefined)?.usage;
        if (u?.input_tokens) promptTokens = u.input_tokens;
      } else if (t === "content_block_delta") {
        const d = (frame.delta as { type?: string; text?: string } | undefined);
        if (d?.type === "text_delta" && d.text) yield { delta: d.text };
      } else if (t === "message_delta") {
        const u = (frame.usage as { output_tokens?: number } | undefined);
        if (u?.output_tokens) completionTokens = u.output_tokens;
        const sd = (frame.delta as { stop_reason?: string } | undefined);
        if (sd?.stop_reason) stopReason = sd.stop_reason;
      }
    }

    const usage: TokenUsage = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
    await recordUsage({
      provider: this.kind,
      model: this.model,
      usage,
      analysisRunId: opts?.meta?.analysisRunId as string | undefined,
      repositoryId: opts?.meta?.repositoryId as string | undefined,
      agentType: opts?.meta?.agentType as string | undefined,
    });
    yield {
      delta: "",
      finish: stopReason === "end_turn" ? "stop" : (stopReason as ChatResult["finishReason"]) ?? "unknown",
      usage,
    };
  }
}
