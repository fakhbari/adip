// Run detail API.
//
// Polish P1.5. Returns one AnalysisRun joined with its RunEvent timeline
// + LLMUsage rows + the Document versions produced during the run window.
// Used by the run-detail page (tabs: Overview / Agents / Events / LLM
// Calls / Errors / Documents).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant, assertOwnership } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";
import { listRunEvents } from "@/lib/run-events";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { id, runId } = await params;
    const repo = await db.repository.findUnique({ where: { id }, select: { tenantId: true } });
    const own = assertOwnership(repo, ctx);
    if (own) return own;

    const run = await db.analysisRun.findFirst({
      where: { id: runId, repositoryId: id },
    });
    if (!run) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [events, usage] = await Promise.all([
      listRunEvents(runId),
      db.lLMUsage.findMany({
        where: { analysisRunId: runId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // Documents created during the run window. We approximate via
    // generatedAt BETWEEN startedAt and completedAt — once the
    // orchestrator stamps Document.analysisRunId directly, replace this.
    const startedAt = run.startedAt ?? run.createdAt;
    const completedAt = run.completedAt ?? new Date();
    const documents = await db.document.findMany({
      where: {
        repositoryId: id,
        generatedAt: { gte: startedAt, lte: completedAt },
      },
      orderBy: { generatedAt: "asc" },
      select: {
        id: true,
        type: true,
        title: true,
        version: true,
        status: true,
        generatedAt: true,
        generatedBy: true,
      },
    });

    return NextResponse.json({ run, events, usage, documents });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
