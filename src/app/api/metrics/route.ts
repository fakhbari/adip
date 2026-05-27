import { NextResponse } from "next/server";
import { metricsRegistry, dbPoolActive, dbPoolIdle } from "@/lib/metrics";
import { db } from "@/lib/db";

// Prometheus scrape endpoint. Public on purpose — same posture as /api
// health endpoint (no session check). If you want to gate it, terminate
// it at the gateway with an `Authorization` check; do not move the
// metrics surface behind NextAuth because Prometheus does not speak it.

// Polish P6.3 — populate the db-pool gauges per scrape. Prisma exposes
// pool counters via `$metrics.json()` when the schema's `previewFeatures`
// includes `metrics`. We catch + ignore when the feature is off so the
// scrape never 500s on a non-preview build.
async function syncPrismaPoolGauges(): Promise<void> {
  try {
    type PrismaWithMetrics = { $metrics?: { json: () => Promise<{ counters: Array<{ key: string; value: number }> }> } };
    const dbi = db as unknown as PrismaWithMetrics;
    if (!dbi.$metrics) return;
    const m = await dbi.$metrics.json();
    const active = m.counters.find((c) => c.key === "prisma_pool_connections_busy")?.value;
    const idle = m.counters.find((c) => c.key === "prisma_pool_connections_idle")?.value;
    if (typeof active === "number") dbPoolActive.set(active);
    if (typeof idle === "number") dbPoolIdle.set(idle);
  } catch {
    // Best-effort; feature flag absent or library version mismatch.
  }
}

export async function GET() {
  await syncPrismaPoolGauges();
  const body = await metricsRegistry.metrics();
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": metricsRegistry.contentType },
  });
}
