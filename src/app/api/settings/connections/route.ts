import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptOptional } from "@/lib/crypto";
import { requireTenant, withTenant } from "@/lib/tenant";
import { logActivity } from "@/lib/audit";

// Shape we return for a connection. Note: accessToken is never returned;
// callers get a boolean indicator instead.
type ConnectionDTO = {
  id: string;
  name: string;
  type: string;
  url: string;
  username: string | null;
  isActive: boolean;
  lastSync: Date | null;
  createdAt: Date;
  updatedAt: Date;
  hasAccessToken: boolean;
};

function toDTO(c: {
  id: string;
  name: string;
  type: string;
  url: string;
  username: string | null;
  accessToken: string | null;
  isActive: boolean;
  lastSync: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ConnectionDTO {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    url: c.url,
    username: c.username,
    isActive: c.isActive,
    lastSync: c.lastSync,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    hasAccessToken: c.accessToken !== null && c.accessToken !== "",
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenant(request);
    if (ctx instanceof NextResponse) return ctx;

    const connections = await db.repositoryConnection.findMany({
      where: withTenant({}, ctx),
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(connections.map(toDTO));
  } catch (error) {
    console.error("Error fetching connections:", error);
    return NextResponse.json({ error: "Failed to fetch connections" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenant(request);
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const { name, type, url, accessToken, username } = body;

    if (!name || !type || !url) {
      return NextResponse.json(
        { error: "Missing required fields: name, type, url" },
        { status: 400 }
      );
    }

    // Encrypt accessToken before persisting (Phase 2). encryptOptional is a
    // no-op for empty/null, and idempotent for already-encrypted blobs.
    const encryptedToken = encryptOptional(accessToken);

    const connection = await db.repositoryConnection.create({
      data: {
        tenantId: ctx.tenantId,
        name,
        type: type.toLowerCase(),
        url: url.replace(/\/$/, ""),
        accessToken: encryptedToken,
        username: username ?? null,
        isActive: true,
      },
    });

    await logActivity({
      ctx,
      action: "connection.create",
      entityType: "RepositoryConnection",
      entityId: connection.id,
      details: { name, type, url: connection.url },
    });

    return NextResponse.json(toDTO(connection));
  } catch (error) {
    console.error("Error creating connection:", error);
    return NextResponse.json({ error: "Failed to create connection" }, { status: 500 });
  }
}
