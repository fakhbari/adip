#!/usr/bin/env node
/**
 * adip-worker — BullMQ consumer for the `adip:analysis` queue.
 *
 * Phase 1.1: replaces the in-process fire-and-forget runAnalysis() helper.
 * Each worker instance pulls at most one job at a time (concurrency: 1).
 * Run multiple replicas to achieve the proposal's "10 parallel workers"
 * target — they all share the same Redis queue and the BullMQ job-id
 * deduplication prevents double-consumption.
 *
 * Bootstrap: `npm run worker` (added in package.json).
 */

import { Worker, Queue } from "bullmq";
import { ANALYSIS_QUEUE, NOTIFICATION_RETRY_QUEUE, connection, type AnalysisJobPayload, type NotificationRetryPayload } from "../src/lib/queue";
import { retryDelivery } from "../src/lib/notifications/dispatcher";
import { AgentOrchestrator } from "../src/lib/agents/orchestrator";
import type { AgentType, WSAnalysisCompleteMessage, WSProgressMessage } from "../src/lib/agents/types";
import { db } from "../src/lib/db";
import { logger } from "../src/lib/logger";
import { fanoutScheduledScan, reconcileSchedules, type ScheduleJobPayload } from "../src/lib/scheduler/reconciler";
import { assertEncryptionKey } from "../src/lib/crypto";
import { queueJobsActive } from "../src/lib/metrics";

// Polish P3.6 — fail-fast on boot if the encryption key is missing.
// Without this, the first analysis crashes mid-run on decryptOptional.
try {
  assertEncryptionKey();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("[worker] ADIP_ENCRYPTION_KEY missing or malformed; refusing to start.");
  process.exit(1);
}

const log = logger("worker");

const WS_INTERNAL_URL = process.env.ADIP_WS_INTERNAL_URL ?? "http://localhost:3003";
const WS_TOKEN = process.env.ADIP_INTERNAL_TOKEN ?? "";

async function notify(action: "progress" | "complete" | "error", data: unknown): Promise<void> {
  try {
    await fetch(`${WS_INTERNAL_URL}/notify/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(WS_TOKEN ? { "X-Internal-Token": WS_TOKEN } : {}),
      },
      body: JSON.stringify(data),
    });
  } catch (err) {
    log.warn({ err, action }, "ws notify failed");
  }
}

async function handleJob(payload: AnalysisJobPayload): Promise<void> {
  const { analysisRunId, repositoryId, triggeredBy, enabledAgents } = payload;
  log.info({ analysisRunId, repositoryId }, "starting analysis");

  // Promote QUEUED -> RUNNING the moment we pick the job up.
  await db.analysisRun.update({
    where: { id: analysisRunId },
    data: { status: "RUNNING", startedAt: new Date(), lastHeartbeatAt: new Date() },
  });

  const orchestrator = new AgentOrchestrator({
    analysisRunId,
    repositoryId,
    triggeredBy,
    enabledAgents: enabledAgents as AgentType[] | undefined,
  });

  orchestrator.setCallbacks(
    async (progress: WSProgressMessage) => {
      await notify("progress", progress);
    },
    async (complete: WSAnalysisCompleteMessage) => {
      await notify("complete", complete);
    }
  );

  try {
    await orchestrator.execute();
    log.info({ analysisRunId }, "analysis completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ analysisRunId, err: message }, "analysis failed");
    // Polish P3.4 — reorder + isolate side effects so a DB outage
    // during the FAILED write cannot eat the original error.
    // Each side effect is best-effort; the original error is always
    // re-thrown for BullMQ retry accounting.
    try {
      await db.analysisRun.update({
        where: { id: analysisRunId },
        data: { status: "FAILED", completedAt: new Date(), errors: JSON.stringify([message]) },
      });
    } catch (dbErr) {
      log.warn(
        { analysisRunId, err: dbErr instanceof Error ? dbErr.message : String(dbErr) },
        "FAILED update itself failed — janitor will sweep"
      );
    }
    try {
      await notify("error", { analysisRunId, repositoryId, error: message });
    } catch (nErr) {
      log.warn(
        { analysisRunId, err: nErr instanceof Error ? nErr.message : String(nErr) },
        "WS error notify failed"
      );
    }
    throw err; // surface to BullMQ for retry accounting
  }
}

const worker = new Worker<AnalysisJobPayload>(ANALYSIS_QUEUE, async (job) => handleJob(job.data), {
  connection,
  concurrency: Number(process.env.ADIP_WORKER_CONCURRENCY ?? 1),
});

worker.on("ready", () => log.info("worker ready"));
worker.on("error", (err) => log.error({ err: err.message }, "worker error"));
worker.on("failed", (job, err) => log.error({ jobId: job?.id, err: err.message }, "job failed"));

// Phase 0.4: scheduler. A second worker pulls cron-fired fanout jobs
// from `adip-schedule` and turns each into a wave of analyze-repo jobs.
const scheduleWorker = new Worker<ScheduleJobPayload>(
  "adip-schedule",
  async (job) => fanoutScheduledScan(job.data),
  { connection, concurrency: 1 }
);
scheduleWorker.on("error", (err) => log.error({ err: err.message }, "schedule worker error"));

// Polish P6.4 — notification retry consumer. Reads NotificationDelivery
// rows by id (the queue payload is intentionally tiny — webhook URLs can
// rotate between attempts). Lets BullMQ's exponential backoff drive the
// retry cadence; we just signal success/failure by returning or throwing.
const notificationRetryWorker = new Worker<NotificationRetryPayload>(
  NOTIFICATION_RETRY_QUEUE,
  async (job) => {
    const outcome = await retryDelivery(job.data.deliveryId);
    if (!outcome.ok) throw new Error(outcome.error ?? "retry failed");
  },
  { connection, concurrency: 2 }
);
notificationRetryWorker.on("error", (err) => log.error({ err: err.message }, "notification retry worker error"));

// Polish P6.3 — queue-depth poller. Sets the `adip_queue_jobs_active`
// gauge each tick from BullMQ's job-counts API so /api/metrics shows live
// backlog. A separate Queue handle is used (worker.close() only stops the
// consumer; this poller reads state).
const queueHandle = new Queue<AnalysisJobPayload>(ANALYSIS_QUEUE, { connection });
const QUEUE_POLL_MS = 5_000;
async function pollQueueDepth() {
  try {
    const counts = await queueHandle.getJobCounts("waiting", "active", "delayed", "failed", "completed");
    for (const [state, n] of Object.entries(counts)) {
      queueJobsActive.labels(ANALYSIS_QUEUE, state).set(typeof n === "number" ? n : 0);
    }
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "queue-depth poll failed");
  }
}
void pollQueueDepth();
const queueDepthTimer = setInterval(pollQueueDepth, QUEUE_POLL_MS);

// Reconciler tick: sync DB schedules to BullMQ repeat jobs.
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
async function reconcileTick() {
  try {
    const { added, removed } = await reconcileSchedules();
    if (added || removed) log.info({ added, removed }, "schedules reconciled");
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "reconcile failed");
  }
}
void reconcileTick();
const reconcileTimer = setInterval(reconcileTick, RECONCILE_INTERVAL_MS);

const shutdown = async (signal: string) => {
  log.info({ signal }, "shutting down");
  clearInterval(reconcileTimer);
  clearInterval(queueDepthTimer);
  await worker.close();
  await scheduleWorker.close();
  await notificationRetryWorker.close();
  await queueHandle.close();
  await db.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
