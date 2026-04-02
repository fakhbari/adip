import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const connections = await db.repositoryConnection.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(connections);
  } catch (error) {
    console.error("Error fetching connections:", error);
    return NextResponse.json({ error: "Failed to fetch connections" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, url, accessToken } = body;

    if (!name || !type || !url) {
      return NextResponse.json(
        { error: "Missing required fields: name, type, url" },
        { status: 400 }
      );
    }

    // Create connection in database
    const connection = await db.repositoryConnection.create({
      data: {
        name,
        type: type.toLowerCase(),
        url: url.replace(/\/$/, ""), // Remove trailing slash
        accessToken: accessToken || null,
        isActive: true,
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        action: "connection_created",
        entityType: "repository_connection",
        entityId: connection.id,
        details: JSON.stringify({
          name,
          type,
          url: connection.url,
        }),
      },
    });

    return NextResponse.json(connection);
  } catch (error) {
    console.error("Error creating connection:", error);
    return NextResponse.json({ error: "Failed to create connection" }, { status: 500 });
  }
}
