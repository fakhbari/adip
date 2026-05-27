// Structured-output helper with retry-on-malformed.
//
// Phase 2.4. Wraps `LLMProvider.chat()`:
//   1. Calls the model with the given messages.
//   2. Strips markdown fences and parses JSON from the response.
//   3. Validates against the supplied Zod schema.
//   4. On failure, re-prompts with the validation error appended,
//      up to `maxAttempts` (default 3) total tries.
//
// The classic ai-generate route used a one-shot try/catch + a hardcoded
// fallback object. That swallowed every error. The schema-validated
// loop is the difference between "agent occasionally produces nonsense
// once a week" and "agent produces nonsense and we silently store it".

import type { z } from "zod";
import type { LLMProvider } from "./provider";
import type { ChatDelta, ChatMessage, ChatOptions, ChatResult, TokenUsage } from "./types";
import { logger } from "@/lib/logger";

const log = logger("llm.structured");

export type RunWithSchemaResult<T> = {
  data: T;
  usage: TokenUsage;
  attempts: number;
  raw: string;
};

export class SchemaValidationError extends Error {
  constructor(public readonly issues: unknown, public readonly raw: string) {
    super("Schema validation failed after retries");
    this.name = "SchemaValidationError";
  }
}

export type RunWithSchemaOptions = ChatOptions & {
  maxAttempts?: number;
  /**
   * Polish P4.3 — streaming hooks. When provider supports `stream()`,
   * `runWithSchema` consumes the deltas and fans them out via these
   * callbacks. Used by the orchestrator to persist `llm-delta` RunEvents
   * and push them to the live log page via the WS service.
   *
   * Callbacks are best-effort — runWithSchema swallows their errors so
   * a flaky observer cannot break the LLM call.
   */
  onPrompt?: (messages: ChatMessage[], attempt: number) => void | Promise<void>;
  onDelta?: (delta: string, attempt: number) => void | Promise<void>;
  onFinal?: (content: string, usage: TokenUsage, attempt: number) => void | Promise<void>;
};

async function safeCall<T extends unknown[]>(fn: ((...args: T) => unknown) | undefined, ...args: T): Promise<void> {
  if (!fn) return;
  try {
    await fn(...args);
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "stream callback threw");
  }
}

/**
 * Polish P4.3 — drain provider.stream() while accumulating content and
 * forwarding deltas to the caller. Returns the same shape as chat().
 *
 * If the stream throws halfway through, we surface the partial content
 * via the thrown error's `.partial` field so the orchestrator can record
 * an `llm-response` event with whatever the model managed to emit.
 */
async function streamToResult(
  provider: LLMProvider,
  messages: ChatMessage[],
  opts: RunWithSchemaOptions | undefined,
  attempt: number
): Promise<ChatResult> {
  if (!provider.stream) {
    // Provider does not implement streaming — fall back to chat().
    return provider.chat(messages, opts);
  }
  let content = "";
  let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let finish: ChatResult["finishReason"] = "unknown";
  try {
    const iter: AsyncIterable<ChatDelta> = provider.stream(messages, opts);
    for await (const chunk of iter) {
      if (chunk.delta) {
        content += chunk.delta;
        await safeCall(opts?.onDelta, chunk.delta, attempt);
      }
      if (chunk.finish) finish = chunk.finish;
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.promptTokens ?? usage.promptTokens,
          completionTokens: chunk.usage.completionTokens ?? usage.completionTokens,
          totalTokens:
            chunk.usage.totalTokens ??
            (chunk.usage.promptTokens ?? usage.promptTokens) +
              (chunk.usage.completionTokens ?? usage.completionTokens),
        };
      }
    }
    return { content, usage, finishReason: finish };
  } catch (err) {
    // Surface partial content so callers can still persist what we got.
    const wrapped = err instanceof Error ? err : new Error(String(err));
    (wrapped as Error & { partial?: string }).partial = content;
    throw wrapped;
  }
}

/**
 * Strip ``` fences and locate the first balanced JSON object/array in
 * the response. Models love to wrap structured output in code fences
 * despite instructions; we deal with it instead of failing.
 */
function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json|yaml|yml)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Find the first { or [ and the matching closing brace via balance.
  const openIdx = raw.search(/[{[]/);
  if (openIdx < 0) return raw.trim();
  const open = raw[openIdx];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIdx; i < raw.length; i++) {
    const c = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return raw.slice(openIdx, i + 1);
    }
  }
  return raw.trim();
}

export async function runWithSchema<T>(args: {
  provider: LLMProvider;
  messages: ChatMessage[];
  schema: z.ZodType<T>;
  opts?: RunWithSchemaOptions;
}): Promise<RunWithSchemaResult<T>> {
  const maxAttempts = args.opts?.maxAttempts ?? 3;
  let messages: ChatMessage[] = args.messages;
  let lastIssues: unknown = null;
  let lastRaw = "";
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await safeCall(args.opts?.onPrompt, messages, attempt);
    // Polish P4.3 — prefer streaming when the provider supports it so the
    // live log page can render tokens as they arrive. Falls back to chat()
    // transparently when no .stream() is implemented.
    const result = await streamToResult(args.provider, messages, args.opts, attempt);
    totalPromptTokens += result.usage.promptTokens;
    totalCompletionTokens += result.usage.completionTokens;
    lastRaw = result.content;
    await safeCall(args.opts?.onFinal, result.content, result.usage, attempt);

    let parsed: unknown;
    const candidate = extractJson(result.content);
    try {
      parsed = JSON.parse(candidate);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log.warn({ attempt, errMsg }, "JSON parse failed; re-prompting");
      lastIssues = `JSON parse error: ${errMsg}`;
      messages = [
        ...args.messages,
        { role: "assistant", content: result.content },
        {
          role: "user",
          content: `Your previous response could not be parsed as JSON: ${errMsg}. Return ONLY the JSON object/array, no prose, no markdown fences.`,
        },
      ];
      continue;
    }

    const validated = args.schema.safeParse(parsed);
    if (validated.success) {
      return {
        data: validated.data,
        usage: {
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
        },
        attempts: attempt,
        raw: result.content,
      };
    }

    lastIssues = validated.error.issues;
    log.warn({ attempt, issues: validated.error.issues }, "schema validation failed; re-prompting");
    messages = [
      ...args.messages,
      { role: "assistant", content: result.content },
      {
        role: "user",
        content: `Your previous response did not match the required schema. Issues:\n${JSON.stringify(
          validated.error.issues,
          null,
          2
        )}\n\nReturn ONLY a valid JSON value that satisfies the schema.`,
      },
    ];
  }

  throw new SchemaValidationError(lastIssues, lastRaw);
}
