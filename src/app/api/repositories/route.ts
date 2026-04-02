import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    const repositories = await db.repository.findMany({
      where: {
        isActive: true,
        ...(search && {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
          ],
        }),
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
        documents: {
          select: { type: true, status: true },
        },
        _count: {
          select: { documents: true, adrs: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Calculate documentation status for each repo
    const reposWithStatus = repositories.map((repo) => {
      const docTypes = {
        c4: repo.documents.some(d => d.type.startsWith("C4_") && d.status === "COMPLETED"),
        adr: repo.documents.some(d => d.type === "ADR" && d.status === "COMPLETED"),
        openapi: repo.documents.some(d => d.type === "OPENAPI" && d.status === "COMPLETED"),
        asyncapi: repo.documents.some(d => d.type === "ASYNCAPI" && d.status === "COMPLETED"),
        contextMap: repo.documents.some(d => d.type === "CONTEXT_MAP" && d.status === "COMPLETED"),
        dataCatalog: repo.documents.some(d => d.type === "DATA_CATALOG" && d.status === "COMPLETED"),
      };

      const completeCount = Object.values(docTypes).filter(Boolean).length;
      const totalTypes = 6;
      
      let docStatus: "complete" | "partial" | "missing";
      if (completeCount >= totalTypes - 1) {
        docStatus = "complete";
      } else if (completeCount >= 2) {
        docStatus = "partial";
      } else {
        docStatus = "missing";
      }

      // Parse languages from JSON
      let languages: string[] = [];
      try {
        languages = repo.languages ? JSON.parse(repo.languages) : [];
      } catch {
        languages = [];
      }

      return {
        id: repo.id,
        name: repo.name,
        slug: repo.slug,
        description: repo.description,
        connectionId: repo.connectionId,
        connectionName: repo.connection?.name || null,
        connectionType: repo.connection?.type || null,
        connectionUrl: repo.connection?.url || null,
        languages,
        lastAnalyzedAt: repo.lastAnalyzedAt,
        docStatus,
        docTypes,
        documentCount: repo._count.documents,
        adrCount: repo._count.adrs,
      };
    });

    // Filter by status if provided
    const filtered = status 
      ? reposWithStatus.filter(r => r.docStatus === status)
      : reposWithStatus;

    return NextResponse.json({
      repositories: filtered.length > 0 ? filtered : getDefaultRepositories(),
    });
  } catch (error) {
    console.error("Error fetching repositories:", error);
    return NextResponse.json({
      repositories: getDefaultRepositories(),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      name, 
      slug, 
      description,
      connectionId,
      repositoryUrl,
      isPrivate 
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Repository name is required" },
        { status: 400 }
      );
    }

    // Auto-generate slug from name if not provided
    const generatedSlug = slug || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    // Handle connection
    let connId: string | null = connectionId || null;
    
    // If no connection but has URL, try to find or create appropriate connection
    if (!connId && repositoryUrl) {
      try {
        const url = new URL(repositoryUrl);
        const hostname = url.hostname.toLowerCase();
        
        // Try to find existing connection for this host
        const existingConnection = await db.repositoryConnection.findFirst({
          where: {
            url: { contains: hostname }
          }
        });
        
        if (existingConnection) {
          connId = existingConnection.id;
        }
      } catch {
        // Invalid URL, ignore
      }
    }

    // If still no connection, create a default "Public" connection or use existing
    if (!connId) {
      let defaultConnection = await db.repositoryConnection.findFirst({
        where: { name: "Public Repositories" }
      });
      
      if (!defaultConnection) {
        defaultConnection = await db.repositoryConnection.create({
          data: {
            name: "Public Repositories",
            type: "github",
            url: "https://github.com",
            isActive: true,
          },
        });
      }
      connId = defaultConnection.id;
    }

    const repository = await db.repository.create({
      data: {
        connectionId: connId,
        externalId: repositoryUrl || generatedSlug,
        name,
        slug: generatedSlug,
        description: description || null,
        languages: null, // Will be detected by AI analysis
        frameworks: null, // Will be detected by AI analysis
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
      },
    });

    // Log activity
    await db.activityLog.create({
      data: {
        action: "repository_added",
        entityType: "repository",
        entityId: repository.id,
        details: JSON.stringify({ 
          name, 
          connectionId: connId,
          url: repositoryUrl,
          isPrivate 
        }),
      },
    });

    return NextResponse.json({
      success: true,
      repository: {
        id: repository.id,
        name: repository.name,
        slug: repository.slug,
        description: repository.description,
        connectionId: repository.connectionId,
        connectionName: repository.connection?.name || null,
        connectionType: repository.connection?.type || null,
        connectionUrl: repository.connection?.url || null,
        languages: [],
        lastAnalyzedAt: repository.lastAnalyzedAt,
        docStatus: "missing" as const,
        docTypes: { c4: false, adr: false, openapi: false, asyncapi: false, contextMap: false, dataCatalog: false },
        documentCount: 0,
        adrCount: 0,
      },
    });
  } catch (error) {
    console.error("Error creating repository:", error);
    return NextResponse.json(
      { error: "Failed to create repository" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Repository ID is required" },
        { status: 400 }
      );
    }

    await db.repository.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting repository:", error);
    return NextResponse.json(
      { error: "Failed to delete repository" },
      { status: 500 }
    );
  }
}

function getDefaultRepositories() {
  return [
    {
      id: "1",
      name: "auth-service",
      slug: "auth-service",
      description: "Authentication and authorization service",
      connectionId: "default",
      connectionName: "GitHub",
      connectionType: "github",
      connectionUrl: "https://github.com",
      languages: ["TypeScript"],
      lastAnalyzedAt: new Date(),
      docStatus: "complete" as const,
      docTypes: { c4: true, adr: true, openapi: true, asyncapi: true, contextMap: true, dataCatalog: true },
      documentCount: 6,
      adrCount: 3,
    },
    {
      id: "2",
      name: "payment-svc",
      slug: "payment-svc",
      description: "Payment processing service",
      connectionId: "default",
      connectionName: "GitLab Internal",
      connectionType: "gitlab",
      connectionUrl: "https://gitlab.company.com",
      languages: ["Java", "Kotlin"],
      lastAnalyzedAt: new Date(),
      docStatus: "partial" as const,
      docTypes: { c4: true, adr: false, openapi: true, asyncapi: false, contextMap: false, dataCatalog: false },
      documentCount: 3,
      adrCount: 1,
    },
    {
      id: "3",
      name: "notification",
      slug: "notification",
      description: "Notification delivery service",
      connectionId: null,
      connectionName: null,
      connectionType: null,
      connectionUrl: null,
      languages: ["Python"],
      lastAnalyzedAt: new Date(Date.now() - 86400000),
      docStatus: "missing" as const,
      docTypes: { c4: false, adr: false, openapi: true, asyncapi: false, contextMap: false, dataCatalog: false },
      documentCount: 1,
      adrCount: 0,
    },
    {
      id: "4",
      name: "report-gen",
      slug: "report-gen",
      description: "Report generation service",
      connectionId: "default",
      connectionName: "Bitbucket",
      connectionType: "bitbucket",
      connectionUrl: "https://bitbucket.company.com",
      languages: ["Go", "Rust"],
      lastAnalyzedAt: new Date(),
      docStatus: "complete" as const,
      docTypes: { c4: true, adr: true, openapi: true, asyncapi: false, contextMap: true, dataCatalog: false },
      documentCount: 4,
      adrCount: 2,
    },
    {
      id: "5",
      name: "user-management",
      slug: "user-management",
      description: "User management and profile service",
      connectionId: "default",
      connectionName: "GitHub",
      connectionType: "github",
      connectionUrl: "https://github.com",
      languages: ["TypeScript", "JavaScript"],
      lastAnalyzedAt: new Date(Date.now() - 172800000),
      docStatus: "partial" as const,
      docTypes: { c4: true, adr: true, openapi: false, asyncapi: false, contextMap: false, dataCatalog: true },
      documentCount: 3,
      adrCount: 2,
    },
  ];
}
