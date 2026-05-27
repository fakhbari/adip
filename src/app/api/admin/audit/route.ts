// Admin audit log API.
//
// Polish P1.7. Lists ActivityLog rows for the tenant, newest first,
// with optional filters (action / entityType / date range / user) and
// offset paging. Admin role required.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";
import type { Prisma } from "@prisma/client";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

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
    const pageSize = Math.min(
      Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE
    );
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
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

    const [rows, total] = await Promise.all([
      db.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: pageSize,
      }),
      db.activityLog.count({ where }),
    ]);

    return NextResponse.json({ rows, total, pageSize, offset });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
