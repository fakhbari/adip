import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AnalysisAlreadyRunningError } from "@/lib/agents/orchestrator";
import { enqueueAnalysis } from "@/lib/queue";
import { requireTenant, assertOwnership } from "@/lib/tenant";
import { AgentType } from "@/lib/agents/types";
import { mapErrorToResponse } from "@/lib/api-errors";
import { logActivity } from "@/lib/audit";

// WebSocket notification helper.
// Talks server-to-server to the mini-service. The previous `?XTransformPort=3003`
// suffix was only meaningful to the (now-removed) Caddy SSRF block.
const WS_INTERNAL_URL = process.env.ADIP_WS_INTERNAL_URL ?? "http://localhost:3003";

async function sendWsNotification(action: "progress" | "complete" | "error", data: unknown) {
  try {
    const response = await fetch(`${WS_INTERNAL_URL}/notify/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Phase 3 will require this header on the mini-service side.
        ...(process.env.ADIP_INTERNAL_TOKEN
          ? { "X-Internal-Token": process.env.ADIP_INTERNAL_TOKEN }
          : {}),
      },
      body: JSON.stringify(data),
    });
    return response.ok;
  } catch (error) {
    console.error("Failed to send WS notification:", error);
    return false;
  }
}

// GET /api/repositories/[id]/analysis - Get analysis history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTenant(request);
    if (ctx instanceof NextResponse) return ctx;
    const { id } = await params;

    // Verify the repository belongs to the tenant; AnalysisRun inherits.
    const repo = await db.repository.findUnique({ where: { id }, select: { tenantId: true } });
    const ownership = assertOwnership(repo, ctx);
    if (ownership) return ownership;

    const runs = await db.analysisRun.findMany({
      where: { repositoryId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json(runs);
  } catch (error) {
    console.error("Error fetching analysis runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch analysis runs" },
      { status: 500 }
    );
  }
}

// POST /api/repositories/[id]/analysis - Start a new analysis
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTenant(request);
    if (ctx instanceof NextResponse) return ctx;
    const { id } = await params;

    // Distinguish "no body" (= run defaults) from "malformed body" (= 400).
    // Previously a malformed body was silently swallowed into `{}` and the
    // analysis still started with all agents enabled — confusing for callers
    // who thought their typo'd JSON had been accepted.
    let body: { enabledAgents?: unknown; triggeredBy?: unknown } = {};
    const rawBody = await request.text();
    if (rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody) ?? {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 }
        );
      }
    }
    const enabledAgents = body.enabledAgents;
    // Narrow to the orchestrator's accepted literal union.
    const allowedTriggers = ["manual", "scheduler", "webhook"] as const;
    type TriggerSource = (typeof allowedTriggers)[number];
    const triggeredBy: TriggerSource = allowedTriggers.includes(body.triggeredBy as TriggerSource)
      ? (body.triggeredBy as TriggerSource)
      : "manual";

    // Repository + AI-provider validation. The orchestrator does its own
    // strict version of this; the early checks here give a friendlier error
    // for the common misconfigured cases.
    const repository = await db.repository.findUnique({
      where: { id },
      include: { aiProvider: true },
    });
    const ownership = assertOwnership(repository, ctx);
    if (ownership) return ownership;
    if (!repository) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    let aiProvider = repository.aiProvider;
    if (!aiProvider) {
      aiProvider = await db.aIProvider.findFirst({
        where: { isDefault: true, isActive: true },
      });
    }
    if (!aiProvider) {
      return NextResponse.json(
        { error: "No AI provider configured. Please set up a default AI provider in Settings." },
        { status: 400 }
      );
    }

    try {
      // Phase 1.1: producer-side enqueue. The worker (scripts/worker.ts)
      // pulls the job and wires WS callbacks itself.
      const { analysisRunId, jobId } = await enqueueAnalysis({
        repositoryId: id,
        triggeredBy,
        enabledAgents: enabledAgents as AgentType[] | undefined,
      });
      await logActivity({
        ctx,
        action: "analysis.start",
        entityType: "AnalysisRun",
        entityId: analysisRunId,
        details: { repositoryId: id, triggeredBy, enabledAgents: enabledAgents as string[] | undefined },
      });

      return NextResponse.json({
        success: true,
        analysisRunId,
        jobId,
        status: "QUEUED",
        message: "Analysis queued. Connect to WebSocket for real-time updates.",
      });
    } catch (err) {
      // AnalysisAlreadyRunningError + everything else now flow through
      // the structured envelope; `mapErrorToResponse` knows how to
      // surface the existing run id on 409 and never leaks raw message
      // text on 500.
      return mapErrorToResponse(err);
    }
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

// DELETE /api/repositories/[id]/analysis - Cancel running analysis
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTenant(request);
    if (ctx instanceof NextResponse) return ctx;
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const analysisRunId = searchParams.get("analysisRunId");

    const repo = await db.repository.findUnique({ where: { id }, select: { tenantId: true } });
    const ownership = assertOwnership(repo, ctx);
    if (ownership) return ownership;

    if (!analysisRunId) {
      return NextResponse.json(
        { error: "analysisRunId is required" },
        { status: 400 }
      );
    }

    // Verify the analysisRun actually belongs to this repository before
    // mutating it. The previous code passed both fields into the `where` of
    // an `update`, but Prisma requires the where to be a unique selector;
    // it silently used `id` and ignored `repositoryId`, allowing IDOR
    // (cancel any repo's analysis by knowing the run ID). 404 here rather
    // than 403 avoids leaking whether the run exists in another repository.
    const existing = await db.analysisRun.findUnique({ where: { id: analysisRunId } });
    if (!existing || existing.repositoryId !== id) {
      return NextResponse.json(
        { error: "Analysis run not found" },
        { status: 404 }
      );
    }

    const analysisRun = await db.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
      },
    });

    // Send cancellation notification
    await sendWsNotification("error", {
      analysisRunId,
      repositoryId: id,
      error: "Analysis was cancelled by user",
    });
    await logActivity({ ctx, action: "analysis.cancel", entityType: "AnalysisRun", entityId: analysisRunId });

    return NextResponse.json({
      success: true,
      analysisRun,
    });
  } catch (error) {
    console.error("Error cancelling analysis:", error);
    return NextResponse.json(
      { error: "Failed to cancel analysis" },
      { status: 500 }
    );
  }
}
