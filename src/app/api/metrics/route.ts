import { NextResponse } from "next/server";
import { metricsRegistry } from "@/lib/metrics";

// Prometheus scrape endpoint. Public on purpose — same posture as /api
// health endpoint (no session check). If you want to gate it, terminate
// it at the gateway with an `Authorization` check; do not move the
// metrics surface behind NextAuth because Prometheus does not speak it.
export async function GET() {
  const body = await metricsRegistry.metrics();
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": metricsRegistry.contentType },
  });
}
