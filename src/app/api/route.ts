import { NextResponse } from "next/server";
import { sweepStaleAnalysisRuns } from "@/lib/janitor";

export async function GET() {
  // Lazy janitor kick — sweeps stuck AnalysisRun rows left by a crashed
  // process. Throttled internally; safe to call on every request.
  await sweepStaleAnalysisRuns().catch(() => {
    // Errors are logged inside the janitor; don't fail the health endpoint.
  });

  return NextResponse.json({ ok: true, service: "adip-api" });
}
