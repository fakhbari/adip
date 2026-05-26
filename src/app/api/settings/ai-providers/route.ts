import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptOptional } from "@/lib/crypto";
import { requireTenant, withTenant } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenant(request);
    if (ctx instanceof NextResponse) return ctx;

    const providers = await db.aIProvider.findMany({
      where: withTenant({}, ctx),
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
    const ctx = await requireTenant(request);
    if (ctx instanceof NextResponse) return ctx;
    const body = await request.json();
    const { name, type, apiKey, baseUrl, modelName, maxTokens, temperature, isDefault } = body;

    if (!name || !type || !modelName) {
      return NextResponse.json(
        { error: "Name, type, and modelName are required" },
        { status: 400 }
      );
    }

    // If setting as default, unset other defaults within this tenant first.
    if (isDefault) {
      await db.aIProvider.updateMany({
        where: withTenant({ isDefault: true }, ctx),
        data: { isDefault: false },
      });
    }

    const provider = await db.aIProvider.create({
      data: {
        tenantId: ctx.tenantId,
        name,
        type,
        apiKey: encryptOptional(apiKey),
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
