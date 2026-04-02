import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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

    return NextResponse.json(connection);
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
    const { name, type, url, accessToken, isActive } = body;

    // Check if connection exists
    const existingConnection = await db.repositoryConnection.findUnique({
      where: { id },
    });

    if (!existingConnection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Update connection
    const connection = await db.repositoryConnection.update({
      where: { id },
      data: {
        name: name ?? existingConnection.name,
        type: type?.toLowerCase() ?? existingConnection.type,
        url: url ? url.replace(/\/$/, "") : existingConnection.url,
        accessToken: accessToken !== undefined ? (accessToken || null) : existingConnection.accessToken,
        isActive: isActive !== undefined ? isActive : existingConnection.isActive,
      },
    });

    // Log activity
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

    return NextResponse.json(connection);
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

    // Check if connection exists
    const existingConnection = await db.repositoryConnection.findUnique({
      where: { id },
    });

    if (!existingConnection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Delete connection (cascade will delete related repositories)
    await db.repositoryConnection.delete({
      where: { id },
    });

    // Log activity
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
