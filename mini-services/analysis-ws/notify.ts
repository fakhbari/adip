// Pure helpers for the /notify/* HTTP path. Extracted from index.ts so they
// can be unit-tested without binding a port.

import { z } from "zod";

export const NotifyShapes = {
  progress: z.object({
    analysisRunId: z.string().min(1),
    repositoryId: z.string().min(1),
    progress: z.unknown(),
  }),
  complete: z.object({
    analysisRunId: z.string().min(1),
    repositoryId: z.string().min(1),
    status: z.unknown(),
    results: z.array(z.unknown()).optional(),
    duration: z.number().optional(),
    documentsGenerated: z.number().optional(),
  }),
  error: z.object({
    analysisRunId: z.string().min(1),
    repositoryId: z.string().min(1),
    error: z.string(),
    agentType: z.string().optional(),
  }),
  // Polish P4.4 — LLM streaming delta. Bypasses the 200 ms coalescer
  // (live-log page needs tokens as they arrive); the server batches at
  // ~16 frames/sec/room to keep the browser smooth.
  "llm-delta": z.object({
    analysisRunId: z.string().min(1),
    repositoryId: z.string().min(1),
    agentType: z.string().optional(),
    delta: z.string(),
    finish: z.string().optional(),
  }),
  // Polish P4.4 — generic agent timeline event for the live-log page.
  // Maps 1:1 to the RunEvent rows the orchestrator records.
  "agent-event": z.object({
    analysisRunId: z.string().min(1),
    repositoryId: z.string().min(1),
    type: z.string(),
    agentType: z.string().optional(),
    content: z.unknown().optional(),
    ts: z.string().optional(),
  }),
} as const;

export type NotifyAction = keyof typeof NotifyShapes;

export function isValidAction(value: string): value is NotifyAction {
  return (
    value === "progress" ||
    value === "complete" ||
    value === "error" ||
    value === "llm-delta" ||
    value === "agent-event"
  );
}

export type ValidateInput = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  internalToken: string;
};

export type ValidateResult =
  | { ok: false; status: number; body: { error: string; issues?: unknown } }
  | { ok: true; action: NotifyAction; payload: { analysisRunId: string; repositoryId: string } };

/**
 * Pure validation of an inbound /notify/* call. Returns the parsed action +
 * payload on success, or an HTTP status + error body on failure.
 *
 *   - Wrong method or non-/notify path  → 404
 *   - Missing/wrong X-Internal-Token    → 401
 *   - Unknown action segment            → 400
 *   - Malformed JSON                    → 400
 *   - Payload fails schema              → 400
 */
export function validateNotify(input: ValidateInput): ValidateResult {
  if (input.method !== "POST" || !input.url.startsWith("/notify/")) {
    return { ok: false, status: 404, body: { error: "Not found" } };
  }

  if (!input.internalToken) {
    return { ok: false, status: 401, body: { error: "Unauthorized" } };
  }

  const headerToken = input.headers["x-internal-token"];
  if (typeof headerToken !== "string" || headerToken !== input.internalToken) {
    return { ok: false, status: 401, body: { error: "Unauthorized" } };
  }

  const action = input.url.slice("/notify/".length);
  if (!isValidAction(action)) {
    return { ok: false, status: 400, body: { error: `Unknown action: ${action}` } };
  }

  let data: unknown;
  try {
    data = JSON.parse(input.body);
  } catch {
    return { ok: false, status: 400, body: { error: "Invalid JSON" } };
  }

  const parsed = NotifyShapes[action].safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: { error: "Invalid payload", issues: parsed.error.issues },
    };
  }

  return {
    ok: true,
    action,
    payload: parsed.data as { analysisRunId: string; repositoryId: string },
  };
}
