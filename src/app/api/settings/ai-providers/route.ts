import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/settings/ai-providers - List all AI providers
export async function GET() {
  try {
    const providers = await db.aIProvider.findMany({
      orderBy: [
        { isDefault: "desc" },
        { name: "asc" },
      ],
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

    return NextResponse.json(providers);
  } catch (error) {
    console.error("Error fetching AI providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI providers" },
      { status: 500 }
    );
  }
}

// POST /api/settings/ai-providers - Create new AI provider
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, apiKey, baseUrl, modelName, maxTokens, temperature, isDefault } = body;

    if (!name || !type || !modelName) {
      return NextResponse.json(
        { error: "Name, type, and modelName are required" },
        { status: 400 }
      );
    }

    // If setting as default, unset other defaults first
    if (isDefault) {
      await db.aIProvider.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });
    }

    const provider = await db.aIProvider.create({
      data: {
        name,
        type,
        apiKey: apiKey || null,
        baseUrl: baseUrl || null,
        modelName,
        maxTokens: maxTokens || 4096,
        temperature: temperature ?? 0.7,
        isDefault: isDefault ?? false,
        isActive: true,
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
    console.error("Error creating AI provider:", error);
    return NextResponse.json(
      { error: "Failed to create AI provider" },
      { status: 500 }
    );
  }
}
