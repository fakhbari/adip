import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseLanguages } from "@/lib/repo-fields";
import { requireTenant, withTenant } from "@/lib/tenant";
import { logActivity } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenant(request);
    if (ctx instanceof NextResponse) return ctx;

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    const repositories = await db.repository.findMany({
      where: withTenant(
        {
          isActive: true,
          ...(search && {
            OR: [
              { name: { contains: search } },
              { description: { contains: search } },
            ],
          }),
        },
        ctx
      ),
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

      // Parse languages via the shared helper.
      const languages = parseLanguages(repo);

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

    return NextResponse.json({ repositories: filtered });
  } catch (error) {
    console.error("Error fetching repositories:", error);
    // Previously fell back to a hardcoded `getDefaultRepositories()` fixture on
    // any DB error — that hid real failures from the UI and masked an empty
    // DB during tests. Return a proper 500 instead.
    return NextResponse.json(
      { error: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenant(request);
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
    const {
      name,
      slug,
      description,
      connectionId,
      repositoryUrl,
      // Required downstream by the orchestrator (`initializeVCSClient` throws
      // a misleading error when this is missing). Accept it from the body so
      // callers can pin a specific owner/repo path independently of the URL.
      repositoryPath,
      isPrivate,
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
    
    // If no connection but has URL, try to find a tenant-owned connection.
    if (!connId && repositoryUrl) {
      try {
        const url = new URL(repositoryUrl);
        const hostname = url.hostname.toLowerCase();
        const existingConnection = await db.repositoryConnection.findFirst({
          where: withTenant({ url: { contains: hostname } }, ctx),
        });
        if (existingConnection) connId = existingConnection.id;
      } catch {
        // Invalid URL, ignore
      }
    }

    // If still no connection, create a default "Public" connection for the tenant.
    if (!connId) {
      let defaultConnection = await db.repositoryConnection.findFirst({
        where: withTenant({ name: "Public Repositories" }, ctx),
      });
      if (!defaultConnection) {
        defaultConnection = await db.repositoryConnection.create({
          data: {
            tenantId: ctx.tenantId,
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
        tenantId: ctx.tenantId,
        connectionId: connId,
        externalId: repositoryUrl || generatedSlug,
        name,
        slug: generatedSlug,
        description: description || null,
        repositoryPath: typeof repositoryPath === "string" && repositoryPath ? repositoryPath : null,
        repositoryUrl: typeof repositoryUrl === "string" && repositoryUrl ? repositoryUrl : null,
        languages: null,
        frameworks: null,
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

    // Polish P5.3 — tenant + user attribution via logActivity helper.
    await logActivity({
      ctx,
      action: "repository.create",
      entityType: "Repository",
      entityId: repository.id,
      details: { name, connectionId: connId, url: repositoryUrl, isPrivate },
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

// getDefaultRepositories() was deleted in Phase 4. It returned a fixed array
// of seeded-looking repositories whenever the DB was empty or query failed,
// which hid both empty-DB states and real errors from the UI / tests.
