// In-app metrics summary.
//
// Polish P6.5. Reads the in-process prom-client registry via
// `getMetricsAsJSON()` and projects it into a compact UI shape:
//   - runsPerDay (last 7d, from AnalysisRun rows for the tenant)
//   - vcsLatencyP95 (histogram quantile across the registry)
//   - activeJobs (gauge total)
//
// Admin-only — exposes cross-tenant operational stats.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";
import { metricsRegistry } from "@/lib/metrics";

type Bucket = { le: string; value: number };
type MetricSnapshot =
  | { name: string; type: "counter" | "gauge"; values: Array<{ value: number; labels?: Record<string, string> }> }
  | { name: string; type: "histogram"; values: Array<{ value: number; labels?: Record<string, string>; metricName?: string }> };

/** Approximate p95 from a prom-client histogram snapshot. */
function approxP95(snap: MetricSnapshot): number | null {
  if (snap.type !== "histogram") return null;
  const sumByLe = new Map<number, number>();
  let totalCount = 0;
  for (const v of snap.values) {
    if (v.metricName?.endsWith("_bucket") && v.labels?.le) {
      const le = v.labels.le === "+Inf" ? Number.POSITIVE_INFINITY : Number(v.labels.le);
      sumByLe.set(le, (sumByLe.get(le) ?? 0) + v.value);
    }
    if (v.metricName?.endsWith("_count")) {
      totalCount += v.value;
    }
  }
  if (totalCount === 0) return null;
  const target = totalCount * 0.95;
  const ordered = Array.from(sumByLe.entries()).sort(([a], [b]) => a - b);
  for (const [le, cumulative] of ordered) {
    if (cumulative >= target) return Number.isFinite(le) ? le : null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const repoIds = (
      await db.repository.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true } })
    ).map((r) => r.id);
    const runs = await db.analysisRun.findMany({
      where: { repositoryId: { in: repoIds }, createdAt: { gte: since } },
      select: { createdAt: true, status: true },
    });
    const byDay = new Map<string, { ok: number; failed: number }>();
    for (const r of runs) {
      const k = r.createdAt.toISOString().slice(0, 10);
      const cur = byDay.get(k) ?? { ok: 0, failed: 0 };
      if (r.status === "COMPLETED") cur.ok++;
      else if (r.status === "FAILED" || r.status === "CANCELLED") cur.failed++;
      byDay.set(k, cur);
    }
    const runsPerDay = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, ok: v.ok, failed: v.failed }));

    const metrics = (await metricsRegistry.getMetricsAsJSON()) as unknown as MetricSnapshot[];
    const vcsHistogram = metrics.find((m) => m.name === "adip_vcs_request_seconds");
    const vcsLatencyP95 = vcsHistogram ? approxP95(vcsHistogram) : null;

    const queueGauge = metrics.find((m) => m.name === "adip_queue_jobs_active");
    let activeJobs = 0;
    if (queueGauge?.type === "gauge") {
      for (const v of queueGauge.values) {
        if (v.labels?.state === "active" || v.labels?.state === "waiting") activeJobs += v.value;
      }
    }

    const tokensCounter = metrics.find((m) => m.name === "adip_llm_tokens_total");
    let tokensTotal = 0;
    if (tokensCounter?.type === "counter") {
      for (const v of tokensCounter.values) tokensTotal += v.value;
    }

    return NextResponse.json({ runsPerDay, vcsLatencyP95, activeJobs, tokensTotal });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
