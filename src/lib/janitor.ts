// Background janitor — sweeps stale `AnalysisRun` rows that died with the
// server process. Without this, a crash mid-analysis leaves `RUNNING` rows
// forever and the "is anyone already running?" check in runAnalysis blocks
// all future starts for that repository.
//
// Triggered lazily on first request after boot (via src/app/api/route.ts).
// Idempotent — safe to call repeatedly; only mutates stale rows.

import { db } from "@/lib/db";

// Threshold: any RUNNING/QUEUED row with a stale heartbeat is considered
// dead. The orchestrator beats every 10s (see orchestrator.startHeartbeat).
const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes

let lastSweepAt = 0;
// Don't re-sweep more often than once per minute — the first request after
// boot kicks it off; subsequent requests within the window are no-ops.
const MIN_INTERVAL_MS = 60 * 1000;

export async function sweepStaleAnalysisRuns(opts?: { force?: boolean }): Promise<{ swept: number }> {
  const now = Date.now();
  if (!opts?.force && now - lastSweepAt < MIN_INTERVAL_MS) {
    return { swept: 0 };
  }
  lastSweepAt = now;

  const cutoff = new Date(now - STALE_AFTER_MS);

  // SQLite OR over heartbeat-stale OR no-heartbeat-yet (rows from older
  // schema, or freshly created QUEUED rows that never started).
  const stale = await db.analysisRun.findMany({
    where: {
      status: { in: ["QUEUED", "RUNNING"] },
      OR: [
        { lastHeartbeatAt: { lt: cutoff } },
        { lastHeartbeatAt: null, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true },
  });

  if (stale.length === 0) return { swept: 0 };

  await db.analysisRun.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errors: JSON.stringify(["server restarted or crashed (janitor swept)"]),
    },
  });

  console.warn(`[janitor] swept ${stale.length} stale AnalysisRun row(s)`);
  return { swept: stale.length };
}

// Fire-and-forget kick on module import. We don't await — the first request
// path stays fast — but we want to attempt cleanup as early as possible.
export function kickJanitor(): void {
  sweepStaleAnalysisRuns().catch((err) => console.warn("[janitor] error:", err));
}
