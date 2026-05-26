// Scheduler reconciler — bridges DB-backed `ScheduleConfig` rows to
// BullMQ's `repeat` job feature.
//
// Phase 0.4: on every reconciler tick (every 5 min by default), the
// worker scans `ScheduleConfig` rows; for each active one it ensures a
// matching BullMQ repeat-job exists with the correct cron pattern.
// Disabled or deleted rows have their repeat-jobs removed.
//
// The actual work fired by each schedule is a "fanout" job — it walks
// every active Repository (across all tenants) and enqueues a per-repo
// analyze-repo job onto the main `adip-analysis` queue. Per-repo work
// then flows through the standard worker path.

import { Queue, type ConnectionOptions } from "bullmq";
import { db } from "@/lib/db";
import { connection, enqueueAnalysis } from "@/lib/queue";
import { logger } from "@/lib/logger";

const log = logger("scheduler.reconciler");

const SCHEDULE_QUEUE = "adip-schedule";

export const scheduleQueue = new Queue<ScheduleJobPayload>(SCHEDULE_QUEUE, {
  connection: connection as ConnectionOptions,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 24 * 60 * 60, count: 200 },
    removeOnFail: { age: 7 * 24 * 60 * 60 },
  },
});

export type ScheduleJobPayload = {
  scheduleConfigId: string;
  scheduleType: string; // "full_scan" | "quick_check"
};

/**
 * Reconcile DB ScheduleConfig rows against BullMQ repeat jobs.
 * Idempotent: removes orphans, adds missing, updates changed cron.
 */
export async function reconcileSchedules(): Promise<{ added: number; removed: number }> {
  const dbRows = await db.scheduleConfig.findMany({ where: { isActive: true } });
  const repeatJobs = await scheduleQueue.getRepeatableJobs();

  // Index repeat jobs by `name` (BullMQ uses the job name to identify the repeat).
  const repeatByName = new Map(repeatJobs.map((j) => [j.name, j]));
  const dbByName = new Map(dbRows.map((r) => [`sched-${r.id}`, r]));

  let added = 0;
  let removed = 0;

  // Add or update missing schedules.
  for (const [name, row] of dbByName) {
    const existing = repeatByName.get(name);
    if (existing) {
      // Same cron pattern? If not, remove + re-add.
      if (existing.pattern === row.cronExpression) continue;
      await scheduleQueue.removeRepeatableByKey(existing.key);
    }
    await scheduleQueue.add(
      name,
      { scheduleConfigId: row.id, scheduleType: row.type },
      { repeat: { pattern: row.cronExpression } }
    );
    added++;
    log.info({ scheduleId: row.id, cron: row.cronExpression }, "schedule registered");
  }

  // Remove orphan repeat jobs (DB row deleted or marked inactive).
  for (const job of repeatJobs) {
    if (!dbByName.has(job.name) && job.name.startsWith("sched-")) {
      await scheduleQueue.removeRepeatableByKey(job.key);
      removed++;
      log.info({ name: job.name }, "schedule removed");
    }
  }

  return { added, removed };
}

/**
 * Fan out a scheduled tick into per-repo analyze-repo jobs.
 * The reconciler registers this as the handler for every `sched-*` job
 * name (see worker.ts wiring).
 */
export async function fanoutScheduledScan(payload: ScheduleJobPayload): Promise<void> {
  log.info({ scheduleConfigId: payload.scheduleConfigId, type: payload.scheduleType }, "fanout starting");
  const repos = await db.repository.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let enqueued = 0;
  let skipped = 0;
  for (const repo of repos) {
    try {
      await enqueueAnalysis({ repositoryId: repo.id, triggeredBy: "scheduler" });
      enqueued++;
    } catch (err) {
      // AnalysisAlreadyRunningError: this repo already has a job — skip.
      skipped++;
    }
  }

  // Update lastRun on the schedule config.
  await db.scheduleConfig.update({
    where: { id: payload.scheduleConfigId },
    data: { lastRun: new Date() },
  });

  log.info({ scheduleConfigId: payload.scheduleConfigId, enqueued, skipped }, "fanout complete");
}
