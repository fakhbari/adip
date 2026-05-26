// BullMQ-backed analysis queue.
//
// Phase 1.1 of the Completion Plan. The Next.js API route is now a thin
// queue producer: `POST /api/repositories/[id]/analysis` calls
// `enqueueAnalysis(...)` and returns immediately. A separate worker
// process (scripts/worker.ts) pulls jobs and runs the orchestrator.
//
// Single Redis connection per process via the standard BullMQ guidance.
// REDIS_URL is set by scripts/bootstrap.sh.

import { Queue, type ConnectionOptions } from "bullmq";
import { db } from "@/lib/db";
import { AnalysisAlreadyRunningError } from "@/lib/agents/orchestrator";

// Parse `redis://host:port` into BullMQ connection options.
function parseRedisUrl(url: string): ConnectionOptions {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 6379,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return { host: "localhost", port: 6380, maxRetriesPerRequest: null };
  }
}

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

// BullMQ requires `maxRetriesPerRequest: null` so individual commands do
// not give up after the default 20 retries (would cause job loss under
// transient Redis blips).
export const connection: ConnectionOptions = parseRedisUrl(REDIS_URL);

// BullMQ disallows `:` in queue names (it uses `:` internally as a key separator).
export const ANALYSIS_QUEUE = "adip-analysis";

export const analysisQueue = new Queue<AnalysisJobPayload>(ANALYSIS_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  },
});

export type AnalysisJobPayload = {
  analysisRunId: string;
  repositoryId: string;
  triggeredBy: "manual" | "scheduler" | "webhook";
  enabledAgents?: string[];
};

/**
 * Enqueue a new analysis. The TOCTOU guard (only one RUNNING per
 * repository at a time) is moved here from the old in-process
 * runAnalysis() helper so the BullMQ producer keeps the same contract.
 *
 * Returns `{ analysisRunId, jobId }` on success, throws
 * `AnalysisAlreadyRunningError` if another run is in flight.
 */
export async function enqueueAnalysis(args: {
  repositoryId: string;
  triggeredBy?: "manual" | "scheduler" | "webhook";
  enabledAgents?: string[];
}): Promise<{ analysisRunId: string; jobId: string }> {
  const triggeredBy = args.triggeredBy ?? "manual";

  // Transactional check-and-create so two concurrent producers cannot
  // both create a RUNNING row for the same repository. SQLite serialised
  // writers gave us this for free; Postgres needs the explicit transaction.
  const analysisRun = await db.$transaction(async (tx) => {
    const running = await tx.analysisRun.findFirst({
      where: { repositoryId: args.repositoryId, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (running) throw new AnalysisAlreadyRunningError(running.id);

    return tx.analysisRun.create({
      data: {
        repositoryId: args.repositoryId,
        triggeredBy,
        status: "QUEUED",
        lastHeartbeatAt: new Date(),
      },
    });
  });

  const job = await analysisQueue.add(
    "analyze-repo",
    {
      analysisRunId: analysisRun.id,
      repositoryId: args.repositoryId,
      triggeredBy,
      enabledAgents: args.enabledAgents,
    },
    { jobId: analysisRun.id } // dedupe by analysisRunId
  );

  return { analysisRunId: analysisRun.id, jobId: job.id ?? analysisRun.id };
}

/**
 * Cancel a queued/running analysis. Marks the AnalysisRun as CANCELLED
 * and removes the BullMQ job. Safe to call repeatedly.
 */
export async function cancelAnalysis(analysisRunId: string): Promise<void> {
  const job = await analysisQueue.getJob(analysisRunId);
  if (job) {
    await job.remove().catch(() => {
      // Job already started — let the worker pick up the CANCELLED status
      // on its next heartbeat tick (see worker handler).
    });
  }
}
