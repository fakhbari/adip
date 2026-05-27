// Ollama provider — local OSS option. Talks to /api/chat and /api/embed.
// No API key by default; falls back to authless when none is set.

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
import { iterateNDJSON } from "./stream-parsers";

const DEFAULT_BASE_URL = "http://localhost:11434";

export class OllamaProvider implements LLMProvider {
  readonly kind = "ollama";
  readonly model: string;

  private readonly baseUrl: string;
  private readonly defaultTemperature: number;
  private readonly embedModel: string;

  constructor(opts: { model: string; baseUrl?: string; temperature?: number; embedModel?: string }) {
    this.model = opts.model;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.defaultTemperature = opts.temperature ?? 0.7;
    this.embedModel = opts.embedModel ?? "nomic-embed-text";
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: {
          temperature: opts?.temperature ?? this.defaultTemperature,
          num_predict: opts?.maxTokens,
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Ollama ${res.status}: ${detail.slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
      done_reason?: string;
    };

    const usage: TokenUsage = {
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
      totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
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
      content: data.message?.content ?? "",
      usage,
      finishReason: data.done_reason === "stop" ? "stop" : "unknown",
    };
  }

  /**
   * Polish P4.2 — Ollama streaming. NDJSON on /api/chat with stream:true.
   * Each line is a JSON object; final line has `done:true` plus usage.
   */
  async *stream(messages: ChatMessage[], opts?: ChatOptions): AsyncGenerator<ChatDelta> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        options: {
          temperature: opts?.temperature ?? this.defaultTemperature,
          num_predict: opts?.maxTokens,
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Ollama stream ${res.status}: ${detail.slice(0, 500)}`);
    }

    let promptTokens = 0;
    let completionTokens = 0;
    let doneReason: string | undefined;

    for await (const frame of iterateNDJSON(res)) {
      const f = frame as {
        message?: { content?: string };
        done?: boolean;
        done_reason?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      if (f.message?.content) yield { delta: f.message.content };
      if (f.done) {
        promptTokens = f.prompt_eval_count ?? 0;
        completionTokens = f.eval_count ?? 0;
        doneReason = f.done_reason;
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
      finish: doneReason === "stop" ? "stop" : (doneReason as ChatResult["finishReason"]) ?? "unknown",
      usage,
    };
  }

  async embed(texts: string[], _opts?: EmbedOptions): Promise<EmbedResult> {
    // Ollama embeds one text per request.
    const embeddings: number[][] = [];
    let totalTokens = 0;
    for (const text of texts) {
      const res = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.embedModel, input: text }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Ollama embed ${res.status}: ${detail.slice(0, 500)}`);
      }
      const data = (await res.json()) as { embeddings?: number[][]; embedding?: number[]; prompt_eval_count?: number };
      if (data.embeddings && data.embeddings.length > 0) {
        embeddings.push(data.embeddings[0]);
      } else if (data.embedding) {
        embeddings.push(data.embedding);
      } else {
        embeddings.push([]);
      }
      totalTokens += data.prompt_eval_count ?? 0;
    }
    return { embeddings, usage: { totalTokens } };
  }
}
