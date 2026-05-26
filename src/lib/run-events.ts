// Run-event recorder.
//
// Polish Phase D (P4.1) writers use this; the live-log page (P2.6) and
// the run-detail page (P1.5) consume the resulting rows.
//
// Events form the durable timeline for an `AnalysisRun`. They are also
// the source of truth for the WS `agent-event` and `llm-delta` channels:
// the writer records the event AND emits it; consumers can subscribe to
// the live stream or replay from this table after the run completes.
//
// Writes are best-effort — losing one event never blocks the run.

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const log = logger("run-events");

/**
 * Pinning event kinds to a string union so the run-detail UI's switch
 * statement is exhaustive (and ESLint catches a missing branch).
 */
export type RunEventType =
  | "run-start"
  | "run-complete"
  | "run-failed"
  | "agent-start"
  | "agent-end"
  | "agent-failed"
  | "llm-prompt"
  | "llm-delta"
  | "llm-response"
  | "llm-call-start"
  | "llm-call-end"
  | "snapshot-write"
  | "save-results";

export type RunEventRole = "system" | "user" | "assistant";

export type RecordRunEventArgs = {
  analysisRunId: string;
  type: RunEventType;
  agentType?: string;
  /** Caller may pass a string (raw) or an object (we JSON.stringify it). */
  content?: string | Record<string, unknown>;
  role?: RunEventRole;
  llmUsageId?: string;
  ts?: Date;
};

export async function recordRunEvent(args: RecordRunEventArgs): Promise<void> {
  const content =
    args.content === undefined
      ? null
      : typeof args.content === "string"
        ? args.content
        : JSON.stringify(args.content);
  try {
    await db.runEvent.create({
      data: {
        analysisRunId: args.analysisRunId,
        type: args.type,
        agentType: args.agentType,
        content,
        role: args.role,
        llmUsageId: args.llmUsageId,
        ts: args.ts ?? new Date(),
      },
    });
  } catch (err) {
    log.warn(
      {
        analysisRunId: args.analysisRunId,
        type: args.type,
        err: err instanceof Error ? err.message : String(err),
      },
      "run-event write failed"
    );
  }
}

/**
 * Convenience: list the events for a run in chronological order.
 * The run-detail API uses this; pulled out so the in-memory streaming
 * code path can also fetch a backlog when a client reconnects.
 */
export async function listRunEvents(analysisRunId: string) {
  return db.runEvent.findMany({
    where: { analysisRunId },
    orderBy: { ts: "asc" },
  });
}
