// Notification dispatcher.
//
// Phase 3.6. Centralised entry point — agents / orchestrator call
// `notify({ kind: "analysis-complete", ... })` and the dispatcher
// resolves which channels are enabled for the tenant from Setting
// rows, then fans out. Failures are isolated per-channel: a broken
// Slack webhook does not stop the Teams delivery.
//
// Polish P6.4 — each attempt is persisted as a `NotificationDelivery`
// row. Failures schedule a retry on the `adip-notification-retry`
// BullMQ queue with exponential backoff (max 5 attempts). Manual
// retries from the admin UI re-enqueue the same row.

import { db } from "@/lib/db";
import { decryptOptional } from "@/lib/crypto";
import { postToSlack } from "./slack";
import { postToTeams } from "./teams";
import { logger } from "@/lib/logger";
import { notificationDeliveriesTotal } from "@/lib/metrics";
import { notificationRetryQueue } from "@/lib/queue";

const log = logger("notifications.dispatcher");

export type NotificationKind = "analysis-complete" | "analysis-failed" | "weekly-digest";
export type NotificationChannel = "slack" | "teams";

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

type DeliveryAttempt = {
  channel: NotificationChannel;
  ok: boolean;
  error?: string;
};

/**
 * Attempt one channel. Returns the outcome so the caller can decide whether
 * to insert / update a NotificationDelivery row. Errors are caught so a
 * broken webhook never throws out of dispatcher.notify().
 */
async function attemptChannel(
  channel: NotificationChannel,
  webhookUrl: string,
  args: NotifyArgs
): Promise<DeliveryAttempt> {
  try {
    const ok =
      channel === "slack"
        ? await postToSlack({ webhookUrl, text: `*${args.title}*\n${args.text}` })
        : await postToTeams({ webhookUrl, title: args.title, text: args.text });
    return { channel, ok };
  } catch (err) {
    return { channel, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function recordDelivery(args: {
  tenantId: string;
  kind: NotificationKind;
  channel: NotificationChannel;
  payload: NotifyArgs;
  outcome: DeliveryAttempt;
}): Promise<string> {
  const status = args.outcome.ok ? "sent" : "failed";
  const row = await db.notificationDelivery
    .create({
      data: {
        tenantId: args.tenantId,
        kind: args.kind,
        channel: args.channel,
        payload: JSON.stringify(args.payload),
        status,
        error: args.outcome.error ?? null,
        sentAt: args.outcome.ok ? new Date() : null,
      },
    })
    .catch((err) => {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "delivery row insert failed"
      );
      return null;
    });
  notificationDeliveriesTotal.labels(args.channel, status).inc();
  return row?.id ?? "";
}

export async function notify(args: NotifyArgs): Promise<{ slack: boolean; teams: boolean }> {
  const [slackUrl, teamsUrl] = await Promise.all([
    settingFor(args.tenantId, "slack_webhook_url"),
    settingFor(args.tenantId, "teams_webhook_url"),
  ]);

  const attempts: Promise<DeliveryAttempt | null>[] = [];
  if (slackUrl) attempts.push(attemptChannel("slack", slackUrl, args));
  else attempts.push(Promise.resolve(null));
  if (teamsUrl) attempts.push(attemptChannel("teams", teamsUrl, args));
  else attempts.push(Promise.resolve(null));

  const [slackOutcome, teamsOutcome] = await Promise.all(attempts);

  // Record + schedule retry for any failed channel that had a URL configured.
  for (const outcome of [slackOutcome, teamsOutcome]) {
    if (!outcome) continue;
    const id = await recordDelivery({
      tenantId: args.tenantId,
      kind: args.kind,
      channel: outcome.channel,
      payload: args,
      outcome,
    });
    if (!outcome.ok && id) {
      try {
        await notificationRetryQueue.add("retry-delivery", { deliveryId: id }, { jobId: id });
      } catch (err) {
        log.warn(
          { err: err instanceof Error ? err.message : String(err), deliveryId: id },
          "could not enqueue notification retry"
        );
      }
    }
  }

  const slackOk = slackOutcome?.ok ?? false;
  const teamsOk = teamsOutcome?.ok ?? false;
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

/**
 * Polish P6.4 — replay a failed delivery from its persisted row. Used by
 * both the retry worker and the admin UI's "Retry now" button.
 *
 * Re-decrypts the webhook URL fresh (so a settings rotation since the
 * original attempt takes effect). On success flips the row to "sent" and
 * stamps sentAt. On failure increments retryCount and stays "failed" — the
 * caller decides whether to enqueue another attempt.
 */
export async function retryDelivery(deliveryId: string): Promise<DeliveryAttempt> {
  const row = await db.notificationDelivery.findUnique({ where: { id: deliveryId } });
  if (!row) {
    return { channel: "slack", ok: false, error: `delivery ${deliveryId} not found` };
  }
  await db.notificationDelivery.update({
    where: { id: deliveryId },
    data: { status: "retrying" },
  });
  const channel = row.channel as NotificationChannel;
  const url = await settingFor(row.tenantId, channel === "slack" ? "slack_webhook_url" : "teams_webhook_url");
  if (!url) {
    await db.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: "failed", error: "webhook URL no longer configured", retryCount: { increment: 1 } },
    });
    return { channel, ok: false, error: "webhook URL no longer configured" };
  }
  const payload = JSON.parse(row.payload) as NotifyArgs;
  const outcome = await attemptChannel(channel, url, payload);
  await db.notificationDelivery.update({
    where: { id: deliveryId },
    data: {
      status: outcome.ok ? "sent" : "failed",
      error: outcome.error ?? null,
      sentAt: outcome.ok ? new Date() : null,
      retryCount: { increment: 1 },
    },
  });
  notificationDeliveriesTotal.labels(channel, outcome.ok ? "sent" : "failed").inc();
  return outcome;
}
