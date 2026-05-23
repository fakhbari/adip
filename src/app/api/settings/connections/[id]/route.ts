import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptOptional } from "@/lib/crypto";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const connection = await db.repositoryConnection.findUnique({
      where: { id },
    });

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(toDTO(connection));
  } catch (error) {
    console.error("Error fetching connection:", error);
    return NextResponse.json(
      { error: "Failed to fetch connection" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, type, url, accessToken, username, isActive } = body;

    const existingConnection = await db.repositoryConnection.findUnique({
      where: { id },
    });

    if (!existingConnection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // accessToken handling:
    //   - undefined → keep existing (encrypted) value.
    //   - empty string → clear (set to null).
    //   - non-empty → encrypt and replace.
    let nextAccessToken: string | null = existingConnection.accessToken;
    if (accessToken !== undefined) {
      nextAccessToken = encryptOptional(accessToken);
    }

    const connection = await db.repositoryConnection.update({
      where: { id },
      data: {
        name: name ?? existingConnection.name,
        type: type?.toLowerCase() ?? existingConnection.type,
        url: url ? url.replace(/\/$/, "") : existingConnection.url,
        accessToken: nextAccessToken,
        username: username !== undefined ? (username || null) : existingConnection.username,
        isActive: isActive !== undefined ? isActive : existingConnection.isActive,
      },
    });

    await db.activityLog.create({
      data: {
        action: "connection_updated",
        entityType: "repository_connection",
        entityId: connection.id,
        details: JSON.stringify({
          name: connection.name,
          type: connection.type,
          url: connection.url,
        }),
      },
    });

    return NextResponse.json(toDTO(connection));
  } catch (error) {
    console.error("Error updating connection:", error);
    return NextResponse.json(
      { error: "Failed to update connection" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existingConnection = await db.repositoryConnection.findUnique({
      where: { id },
    });

    if (!existingConnection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    await db.repositoryConnection.delete({
      where: { id },
    });

    await db.activityLog.create({
      data: {
        action: "connection_deleted",
        entityType: "repository_connection",
        entityId: id,
        details: JSON.stringify({
          name: existingConnection.name,
          type: existingConnection.type,
          url: existingConnection.url,
        }),
      },
    });

    return NextResponse.json({ success: true, message: "Connection deleted successfully" });
  } catch (error) {
    console.error("Error deleting connection:", error);
    return NextResponse.json(
      { error: "Failed to delete connection" },
      { status: 500 }
    );
  }
}
