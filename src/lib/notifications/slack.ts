// Slack incoming-webhook notifier.
//
// Phase 3.6. Sends a single message payload to a tenant-configured
// webhook URL. The URL is stored encrypted in Setting(key='slack_webhook_url').
// Errors are logged + swallowed: a notification failure must never
// fail an analysis run.

import { logger } from "@/lib/logger";

const log = logger("notifications.slack");

export async function postToSlack(args: { webhookUrl: string; text: string; blocks?: unknown[] }): Promise<boolean> {
  try {
    const res = await fetch(args.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: args.text, blocks: args.blocks }),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, "slack non-OK");
      return false;
    }
    return true;
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "slack send failed");
    return false;
  }
}
