// Microsoft Teams incoming-webhook notifier.
//
// Same shape as Slack: HTTP POST to a webhook URL. Stored encrypted in
// Setting(key='teams_webhook_url'). Errors logged + swallowed.

import { logger } from "@/lib/logger";

const log = logger("notifications.teams");

/** Build a Teams adaptive-card payload from a simple text + title. */
function adaptiveCard(title: string, text: string) {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text: title, weight: "bolder", size: "medium" },
            { type: "TextBlock", text, wrap: true },
          ],
        },
      },
    ],
  };
}

export async function postToTeams(args: { webhookUrl: string; title: string; text: string }): Promise<boolean> {
  try {
    const res = await fetch(args.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adaptiveCard(args.title, args.text)),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, "teams non-OK");
      return false;
    }
    return true;
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "teams send failed");
    return false;
  }
}
