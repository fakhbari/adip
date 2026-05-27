// Per-document API.
//
// Polish P2.4. Shared GET / PATCH endpoint behind every doc viewer.
// PATCH appends a new version of the document (we never overwrite —
// analysis history is append-only).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";
import { logActivity } from "@/lib/audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { id } = await params;
    const doc = await db.document.findUnique({
      where: { id },
      include: { repository: { select: { tenantId: true, name: true } } },
    });
    if (!doc || doc.repository.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(doc);
  } catch (err) {
    return mapErrorToResponse(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { id } = await params;
    const body = (await request.json()) as { content?: string; title?: string };
    if (!body.content && !body.title) {
      return NextResponse.json({ error: "No changes" }, { status: 400 });
    }
    const doc = await db.document.findUnique({
      where: { id },
      include: { repository: { select: { tenantId: true } } },
    });
    if (!doc || doc.repository.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Append-only: create a new version row rather than mutate the existing.
    const latest = await db.document.findFirst({
      where: { repositoryId: doc.repositoryId, type: doc.type },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const created = await db.document.create({
      data: {
        repositoryId: doc.repositoryId,
        type: doc.type,
        status: "COMPLETED",
        title: body.title ?? doc.title,
        content: body.content ?? doc.content,
        version: (latest?.version ?? 0) + 1,
        generatedAt: new Date(),
        generatedBy: ctx.session.user.email,
      },
    });
    await logActivity({
      ctx,
      action: "document.edit",
      entityType: "Document",
      entityId: created.id,
      details: { fromVersion: doc.version, toVersion: created.version, type: String(doc.type) },
    });
    return NextResponse.json(created);
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
