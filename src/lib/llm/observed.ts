// Observed LLM provider wrapper.
//
// Polish P4.3 — wraps any `LLMProvider` so that every `chat()` / `stream()`
// call automatically:
//   * records an `llm-prompt` RunEvent with the assembled messages,
//   * for streams, forwards each chunk to the WS service so the live-log
//     page can render tokens as they arrive,
//   * records an `llm-response` RunEvent with the final text + usage,
//   * records an `llm-failed` RunEvent on throw (with whatever partial
//     content the model managed to emit).
//
// The orchestrator wraps `context.llm` once and hands it to every agent.
// Agents continue calling `provider.chat()` / `runWithSchema(...)` with no
// awareness of the wrapping — the observability is purely additive.

import type { LLMProvider } from "./provider";
import type { ChatDelta, ChatMessage, ChatOptions, ChatResult, EmbedOptions, EmbedResult } from "./types";
import { recordRunEvent } from "@/lib/run-events";
import { notifyWS } from "@/lib/ws-notify";

export type ObserveScope = {
  analysisRunId: string;
  repositoryId: string;
  defaultAgentType?: string;
};

// Hard cap on prompt content we persist — defensive against an agent that
// shoves an entire repo into a single message. The browser's run-detail
// page does not need megabytes per call. Trims with an explicit marker.
const MAX_PROMPT_PERSIST_BYTES = 32 * 1024;

function flattenPrompt(messages: ChatMessage[]): string {
  const flat = messages.map((m) => `### ${m.role}\n${m.content}`).join("\n\n");
  if (flat.length <= MAX_PROMPT_PERSIST_BYTES) return flat;
  return flat.slice(0, MAX_PROMPT_PERSIST_BYTES) + `\n\n[...truncated ${flat.length - MAX_PROMPT_PERSIST_BYTES} bytes...]`;
}

export function observeProvider(inner: LLMProvider, scope: ObserveScope): LLMProvider {
  const wrapped: LLMProvider = {
    kind: inner.kind,
    model: inner.model,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
      const agentType = (opts?.meta?.agentType as string | undefined) ?? scope.defaultAgentType;
      await recordRunEvent({
        analysisRunId: scope.analysisRunId,
        type: "llm-prompt",
        agentType,
        role: "user",
        content: flattenPrompt(messages),
      });
      try {
        const result = await inner.chat(messages, opts);
        await recordRunEvent({
          analysisRunId: scope.analysisRunId,
          type: "llm-response",
          agentType,
          role: "assistant",
          content: {
            text: result.content.slice(0, MAX_PROMPT_PERSIST_BYTES),
            usage: result.usage,
            finishReason: result.finishReason,
            provider: inner.kind,
            model: inner.model,
          },
        });
        return result;
      } catch (err) {
        await recordRunEvent({
          analysisRunId: scope.analysisRunId,
          type: "llm-call-end",
          agentType,
          content: { error: err instanceof Error ? err.message : String(err), provider: inner.kind, model: inner.model },
        });
        throw err;
      }
    },

    // `stream` and `embed` are attached below if the inner provider
    // implements them. Keep them out of the literal so TypeScript narrows
    // the optional members correctly.
    embed: inner.embed
      ? (texts: string[], opts?: EmbedOptions): Promise<EmbedResult> => inner.embed!(texts, opts)
      : undefined,
  };

  if (inner.stream) {
    // Defining a real async-generator that closes over `scope` + `inner`.
    wrapped.stream = async function* (messages: ChatMessage[], opts?: ChatOptions): AsyncGenerator<ChatDelta> {
      const agentType = (opts?.meta?.agentType as string | undefined) ?? scope.defaultAgentType;
      await recordRunEvent({
        analysisRunId: scope.analysisRunId,
        type: "llm-prompt",
        agentType,
        role: "user",
        content: flattenPrompt(messages),
      });

      let accumulated = "";
      let finalUsage: ChatDelta["usage"] | undefined;
      let finalFinish: ChatDelta["finish"] | undefined;
      try {
        // Non-null asserted — we only enter this branch when inner.stream
        // existed at wrap time.
        const it = inner.stream!(messages, opts);
        for await (const chunk of it) {
          if (chunk.delta) {
            accumulated += chunk.delta;
            // Best-effort live forward; the WS service batches at 60 ms/room
            // so a fast model does not melt the browser.
            void notifyWS("llm-delta", {
              analysisRunId: scope.analysisRunId,
              repositoryId: scope.repositoryId,
              agentType,
              delta: chunk.delta,
            });
          }
          if (chunk.usage) finalUsage = chunk.usage;
          if (chunk.finish) finalFinish = chunk.finish;
          yield chunk;
        }
        await recordRunEvent({
          analysisRunId: scope.analysisRunId,
          type: "llm-response",
          agentType,
          role: "assistant",
          content: {
            text: accumulated.slice(0, MAX_PROMPT_PERSIST_BYTES),
            usage: finalUsage,
            finishReason: finalFinish,
            provider: inner.kind,
            model: inner.model,
          },
        });
        // Final llm-delta with `finish` so the live-log page can transition
        // its "streaming…" indicator off.
        void notifyWS("llm-delta", {
          analysisRunId: scope.analysisRunId,
          repositoryId: scope.repositoryId,
          agentType,
          delta: "",
          finish: finalFinish ?? "stop",
        });
      } catch (err) {
        await recordRunEvent({
          analysisRunId: scope.analysisRunId,
          type: "llm-call-end",
          agentType,
          content: {
            error: err instanceof Error ? err.message : String(err),
            partial: accumulated.slice(0, MAX_PROMPT_PERSIST_BYTES),
            provider: inner.kind,
            model: inner.model,
          },
        });
        throw err;
      }
    };
  }

  return wrapped;
}
