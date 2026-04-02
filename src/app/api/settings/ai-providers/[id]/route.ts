import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/settings/ai-providers/[id] - Get single AI provider
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const provider = await db.aIProvider.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        baseUrl: true,
        modelName: true,
        isActive: true,
        isDefault: true,
        maxTokens: true,
        temperature: true,
        createdAt: true,
        updatedAt: true,
        // Don't return apiKey for security
        _count: {
          select: { repositories: true }
        }
      }
    });

    if (!provider) {
      return NextResponse.json(
        { error: "AI provider not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(provider);
  } catch (error) {
    console.error("Error fetching AI provider:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI provider" },
      { status: 500 }
    );
  }
}

// PUT /api/settings/ai-providers/[id] - Update AI provider
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, type, apiKey, baseUrl, modelName, maxTokens, temperature, isDefault, isActive } = body;

    // Check if provider exists
    const existing = await db.aIProvider.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "AI provider not found" },
        { status: 404 }
      );
    }

    // If setting as default, unset other defaults first
    if (isDefault) {
      await db.aIProvider.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false }
      });
    }

    const provider = await db.aIProvider.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        type: type ?? existing.type,
        apiKey: apiKey !== undefined ? (apiKey || null) : existing.apiKey,
        baseUrl: baseUrl !== undefined ? (baseUrl || null) : existing.baseUrl,
        modelName: modelName ?? existing.modelName,
        maxTokens: maxTokens ?? existing.maxTokens,
        temperature: temperature ?? existing.temperature,
        isDefault: isDefault ?? existing.isDefault,
        isActive: isActive ?? existing.isActive,
      },
      select: {
        id: true,
        name: true,
        type: true,
        baseUrl: true,
        modelName: true,
        isActive: true,
        isDefault: true,
        maxTokens: true,
        temperature: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    return NextResponse.json(provider);
  } catch (error) {
    console.error("Error updating AI provider:", error);
    return NextResponse.json(
      { error: "Failed to update AI provider" },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/ai-providers/[id] - Delete AI provider
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if provider exists
    const existing = await db.aIProvider.findUnique({
      where: { id },
      include: { _count: { select: { repositories: true } } }
    });

    if (!existing) {
      return NextResponse.json(
        { error: "AI provider not found" },
        { status: 404 }
      );
    }

    // Check if provider is being used by repositories
    if (existing._count.repositories > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${existing._count.repositories} repositories are using this provider` },
        { status: 400 }
      );
    }

    await db.aIProvider.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting AI provider:", error);
    return NextResponse.json(
      { error: "Failed to delete AI provider" },
      { status: 500 }
    );
  }
}
