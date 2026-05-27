// WS notify helper.
//
// Polish P4.3 / P4.4. The orchestrator + LLM provider wrapper call this to
// push events to the analysis-ws mini-service over its `/notify/{action}`
// endpoint, which then fans them out to subscribed browser sockets.
//
// Best-effort — a failure here is logged but never thrown, so a WS outage
// cannot break the analysis itself.
//
// Two-way contract: the `action` string must match one of the values the
// WS service's `validateNotify()` accepts (see
// mini-services/analysis-ws/notify.ts).

import { logger } from "@/lib/logger";

const log = logger("ws-notify");

const WS_INTERNAL_URL = process.env.ADIP_WS_INTERNAL_URL ?? "http://localhost:3003";
const WS_TOKEN = process.env.ADIP_INTERNAL_TOKEN ?? "";

export type WSNotifyAction =
  | "progress"
  | "complete"
  | "error"
  | "llm-delta"
  | "agent-event";

export async function notifyWS(action: WSNotifyAction, payload: unknown): Promise<void> {
  try {
    await fetch(`${WS_INTERNAL_URL}/notify/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(WS_TOKEN ? { "X-Internal-Token": WS_TOKEN } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), action },
      "ws notify failed"
    );
  }
}
