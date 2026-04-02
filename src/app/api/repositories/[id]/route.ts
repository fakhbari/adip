import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/repositories/[id] - Get single repository
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const repository = await db.repository.findUnique({
      where: { id },
      include: {
        connection: {
          select: {
            id: true,
            name: true,
            type: true,
            url: true,
          },
        },
        aiProvider: {
          select: {
            id: true,
            name: true,
            type: true,
            modelName: true,
          },
        },
        documents: {
          select: {
            id: true,
            type: true,
            status: true,
            title: true,
            generatedAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        technologies: {
          include: {
            technology: {
              select: {
                id: true,
                name: true,
                category: true,
              },
            },
          },
        },
        adrs: {
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            createdAt: true,
          },
          orderBy: { number: "asc" },
        },
        analysisRuns: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            documentsGenerated: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    if (!repository) {
      return NextResponse.json(
        { error: "Repository not found" },
        { status: 404 }
      );
    }

    // Parse JSON fields
    const result = {
      ...repository,
      languages: repository.languages ? JSON.parse(repository.languages) : [],
      frameworks: repository.frameworks ? JSON.parse(repository.frameworks) : [],
      technologies: repository.technologies.map((t: any) => ({
        id: t.technology.id,
        name: t.technology.name,
        category: t.technology.category,
        version: t.version,
        sourceFile: t.sourceFile,
      })),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching repository:", error);
    return NextResponse.json(
      { error: "Failed to fetch repository" },
      { status: 500 }
    );
  }
}

// DELETE /api/repositories/[id] - Delete repository
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Check if repository exists
    const repository = await db.repository.findUnique({
      where: { id },
    });

    if (!repository) {
      return NextResponse.json(
        { error: "Repository not found" },
        { status: 404 }
      );
    }

    // Delete repository (cascade will handle related records)
    await db.repository.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting repository:", error);
    return NextResponse.json(
      { error: "Failed to delete repository" },
      { status: 500 }
    );
  }
}

// PUT /api/repositories/[id] - Update repository
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, aiProviderId, isActive, repositoryPath, repositoryUrl } = body;

    // Check if repository exists
    const existing = await db.repository.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Repository not found" },
        { status: 404 }
      );
    }

    const repository = await db.repository.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        description: description ?? existing.description,
        aiProviderId: aiProviderId !== undefined ? aiProviderId : existing.aiProviderId,
        isActive: isActive ?? existing.isActive,
        repositoryPath: repositoryPath !== undefined ? repositoryPath : existing.repositoryPath,
        repositoryUrl: repositoryUrl !== undefined ? repositoryUrl : existing.repositoryUrl,
      },
      include: {
        connection: {
          select: {
            id: true,
            name: true,
            type: true,
            url: true,
          },
        },
        aiProvider: {
          select: {
            id: true,
            name: true,
            type: true,
            modelName: true,
          },
        },
      },
    });

    return NextResponse.json(repository);
  } catch (error) {
    console.error("Error updating repository:", error);
    return NextResponse.json(
      { error: "Failed to update repository" },
      { status: 500 }
    );
  }
}
