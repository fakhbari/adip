// Admin audit CSV export.
//
// Polish P1.7. Streams the same query as /api/admin/audit but as a
// downloadable CSV. Includes the same filters via query params. Capped
// at 10 000 rows per response so a runaway export cannot OOM the server.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";
import type { Prisma } from "@prisma/client";

const MAX_ROWS = 10_000;

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseDate(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const entityType = url.searchParams.get("entityType");
    const userId = url.searchParams.get("userId");
    const from = parseDate(url.searchParams.get("from"));
    const to = parseDate(url.searchParams.get("to"));

    const where: Prisma.ActivityLogWhereInput = { tenantId: ctx.tenantId };
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (userId) where.userId = userId;
    if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const rows = await db.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });

    const header = ["createdAt", "userId", "action", "entityType", "entityId", "details"];
    const lines = [
      header.join(","),
      ...rows.map((r) =>
        [r.createdAt.toISOString(), r.userId, r.action, r.entityType ?? "", r.entityId ?? "", r.details ?? ""].map(escapeCsv).join(",")
      ),
    ];
    const body = lines.join("\n") + "\n";

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
