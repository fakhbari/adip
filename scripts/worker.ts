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

import { Worker } from "bullmq";
import { ANALYSIS_QUEUE, connection, type AnalysisJobPayload } from "../src/lib/queue";
import { AgentOrchestrator } from "../src/lib/agents/orchestrator";
import type { AgentType, WSAnalysisCompleteMessage, WSProgressMessage } from "../src/lib/agents/types";
import { db } from "../src/lib/db";
import { logger } from "../src/lib/logger";

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
    await db.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errors: JSON.stringify([message]),
      },
    });
    await notify("error", { analysisRunId, repositoryId, error: message });
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

const shutdown = async (signal: string) => {
  log.info({ signal }, "shutting down");
  await worker.close();
  await db.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
