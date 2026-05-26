// Notification dispatcher.
//
// Phase 3.6. Centralised entry point — agents / orchestrator call
// `notify({ kind: "analysis-complete", ... })` and the dispatcher
// resolves which channels are enabled for the tenant from Setting
// rows, then fans out. Failures are isolated per-channel: a broken
// Slack webhook does not stop the Teams delivery.

import { db } from "@/lib/db";
import { decryptOptional } from "@/lib/crypto";
import { postToSlack } from "./slack";
import { postToTeams } from "./teams";
import { logger } from "@/lib/logger";

const log = logger("notifications.dispatcher");

export type NotificationKind = "analysis-complete" | "analysis-failed" | "weekly-digest";

export type NotifyArgs = {
  tenantId: string;
  kind: NotificationKind;
  title: string;
  text: string;
};

async function settingFor(tenantId: string, key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { tenantId_key: { tenantId, key } } });
  if (!row) return null;
  return decryptOptional(row.value);
}

export async function notify(args: NotifyArgs): Promise<{ slack: boolean; teams: boolean }> {
  const [slackUrl, teamsUrl] = await Promise.all([
    settingFor(args.tenantId, "slack_webhook_url"),
    settingFor(args.tenantId, "teams_webhook_url"),
  ]);

  const [slackOk, teamsOk] = await Promise.all([
    slackUrl ? postToSlack({ webhookUrl: slackUrl, text: `*${args.title}*\n${args.text}` }) : Promise.resolve(false),
    teamsUrl ? postToTeams({ webhookUrl: teamsUrl, title: args.title, text: args.text }) : Promise.resolve(false),
  ]);

  log.info(
    {
      tenantId: args.tenantId,
      kind: args.kind,
      slack: slackOk ? "sent" : slackUrl ? "failed" : "unconfigured",
      teams: teamsOk ? "sent" : teamsUrl ? "failed" : "unconfigured",
    },
    "dispatched"
  );

  return { slack: slackOk, teams: teamsOk };
}
