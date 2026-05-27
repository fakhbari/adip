// Data Catalog documents API.
//
// Polish P1.3. Returns the latest DATA_CATALOG Document per repository
// for the calling tenant. The Document.content is whatever the
// data-catalog agent persisted — usually a Mermaid `erDiagram` snippet
// followed by a Markdown data dictionary.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant, withTenant } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const documents = await db.document.findMany({
      where: {
        type: "DATA_CATALOG",
        repository: withTenant({}, ctx),
      },
      include: { repository: { select: { id: true, name: true } } },
      orderBy: { generatedAt: "desc" },
    });

    const repositories = await db.repository.findMany({
      where: withTenant({ isActive: true }, ctx),
      select: { id: true, name: true },
    });

    const formattedDocuments = documents.map((doc) => ({
      id: doc.id,
      repositoryId: doc.repositoryId,
      repositoryName: doc.repository.name,
      title: doc.title || "Data Catalog",
      version: String(doc.version),
      content: doc.content ?? "",
      status: doc.status,
      generatedAt: doc.generatedAt,
    }));

    return NextResponse.json({
      documents: formattedDocuments,
      repositories: repositories.map((r) => ({
        id: r.id,
        name: r.name,
        hasDataCatalog: documents.some((d) => d.repositoryId === r.id),
      })),
    });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
