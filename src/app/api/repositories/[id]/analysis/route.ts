import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AgentOrchestrator } from "@/lib/agents/orchestrator";
import { 
  WSProgressMessage, 
  WSAnalysisCompleteMessage,
  AgentType 
} from "@/lib/agents/types";

// WebSocket notification helper
async function sendWsNotification(action: "progress" | "complete" | "error", data: any) {
  try {
    const response = await fetch(`http://localhost:3003/notify/${action}?XTransformPort=3003`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const { id } = await params;

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
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { enabledAgents, triggeredBy = "manual" } = body;

    // Check if repository exists
    const repository = await db.repository.findUnique({
      where: { id },
      include: {
        connection: true,
        aiProvider: true,
      },
    });

    if (!repository) {
      return NextResponse.json(
        { error: "Repository not found" },
        { status: 404 }
      );
    }

    // Check for AI provider
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

    // Check if there's already a running analysis
    const runningAnalysis = await db.analysisRun.findFirst({
      where: {
        repositoryId: id,
        status: { in: ["QUEUED", "RUNNING"] },
      },
    });

    if (runningAnalysis) {
      return NextResponse.json(
        { 
          error: "An analysis is already running for this repository",
          analysisRunId: runningAnalysis.id,
          status: runningAnalysis.status,
        },
        { status: 409 }
      );
    }

    // Create analysis run record
    const analysisRun = await db.analysisRun.create({
      data: {
        repositoryId: id,
        triggeredBy,
        status: "QUEUED",
      },
    });

    // Create orchestrator
    const orchestrator = new AgentOrchestrator({
      analysisRunId: analysisRun.id,
      repositoryId: id,
      triggeredBy,
      enabledAgents: enabledAgents as AgentType[] | undefined,
    });

    // Set up WebSocket callbacks
    orchestrator.setCallbacks(
      // Progress callback
      async (progress: WSProgressMessage) => {
        await sendWsNotification("progress", progress);
      },
      // Complete callback
      async (complete: WSAnalysisCompleteMessage) => {
        await sendWsNotification("complete", complete);
      }
    );

    // Update status to running
    await db.analysisRun.update({
      where: { id: analysisRun.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    // Run analysis asynchronously (don't await)
    orchestrator.execute().catch(async (error) => {
      console.error("Analysis failed:", error);
      
      await db.analysisRun.update({
        where: { id: analysisRun.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errors: JSON.stringify([error.message || "Unknown error"]),
        },
      });

      // Send error notification
      await sendWsNotification("error", {
        analysisRunId: analysisRun.id,
        repositoryId: id,
        error: error.message || "Analysis failed",
      });
    });

    return NextResponse.json({
      success: true,
      analysisRunId: analysisRun.id,
      status: "QUEUED",
      message: "Analysis started. Connect to WebSocket for real-time updates.",
    });
  } catch (error) {
    console.error("Error starting analysis:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start analysis" },
      { status: 500 }
    );
  }
}

// DELETE /api/repositories/[id]/analysis - Cancel running analysis
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const analysisRunId = searchParams.get("analysisRunId");

    if (!analysisRunId) {
      return NextResponse.json(
        { error: "analysisRunId is required" },
        { status: 400 }
      );
    }

    // Update analysis run to cancelled
    const analysisRun = await db.analysisRun.update({
      where: { id: analysisRunId, repositoryId: id },
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
