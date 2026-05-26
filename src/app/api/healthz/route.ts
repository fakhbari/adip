// Deep healthcheck. Polish P6.1.
//
// Probes every dependency the app needs to function. Returns 200 when
// all hard dependencies are reachable, 200 + "degraded" when soft
// dependencies fail, 503 when a hard dependency is down. The body
// shape matches Kubernetes-style health probes:
//
//   { status, checks: [{ name, ok, durationMs, error? }], durationMs }
//
// Hard:  Postgres, Redis. App cannot serve real traffic without them.
// Soft:  WS notifier. Analyses still run; live progress is lost.
//
// Public on the same posture as /api and /api/metrics (NextAuth-free).

import { NextResponse } from "next/server";
import IORedis from "ioredis";
import { db } from "@/lib/db";

type Check = { name: string; ok: boolean; durationMs: number; error?: string };

async function timed(name: string, fn: () => Promise<void>): Promise<Check> {
  const started = Date.now();
  try {
    await fn();
    return { name, ok: true, durationMs: Date.now() - started };
  } catch (err) {
    return {
      name,
      ok: false,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkPostgres(): Promise<Check> {
  return timed("postgres", async () => {
    await db.$queryRawUnsafe<unknown>("SELECT 1");
  });
}

async function checkRedis(): Promise<Check> {
  return timed("redis", async () => {
    const url = process.env.REDIS_URL ?? "redis://localhost:6380";
    // Short-lived client so the healthcheck does not hold a permanent
    // socket. Default ioredis retry/backoff means a transient blip is
    // tolerated; a long outage surfaces here.
    const client = new IORedis(url, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 2000 });
    try {
      await client.connect();
      const pong = await client.ping();
      if (pong !== "PONG") throw new Error(`unexpected reply: ${pong}`);
    } finally {
      client.disconnect();
    }
  });
}

async function checkWS(): Promise<Check> {
  return timed("analysis-ws", async () => {
    const url = process.env.ADIP_WS_INTERNAL_URL ?? "http://localhost:3003";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(`${url}/healthz`, { signal: controller.signal });
      if (!res.ok) throw new Error(`status ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  });
}

export async function GET() {
  const t0 = Date.now();
  const [pg, redis, ws] = await Promise.all([checkPostgres(), checkRedis(), checkWS()]);
  const checks: Check[] = [pg, redis, ws];

  const hardFail = !pg.ok || !redis.ok;
  const softFail = !ws.ok;
  const status = hardFail ? "fail" : softFail ? "degraded" : "ok";
  const httpStatus = hardFail ? 503 : 200;

  return NextResponse.json(
    { status, checks, durationMs: Date.now() - t0 },
    { status: httpStatus }
  );
}
