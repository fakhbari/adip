// AsyncAPI documents API.
//
// Polish P1.2. Returns the latest ASYNCAPI Document per repository for
// the calling tenant. Schema + agent already exist (Completion P3.1);
// this is the missing read-side.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant, withTenant } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    // We join on Repository.tenantId so a Document can never surface
    // outside its owning tenant, even if the table itself lacks a
    // tenantId column (the cascade source of truth is Repository).
    const documents = await db.document.findMany({
      where: {
        type: "ASYNCAPI",
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
      title: doc.title || "AsyncAPI Specification",
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
        hasAsyncAPI: documents.some((d) => d.repositoryId === r.id),
      })),
    });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
