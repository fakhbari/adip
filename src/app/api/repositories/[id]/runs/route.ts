// Run history API.
//
// Polish P1.4. Paged list of AnalysisRun rows for one repository, newest
// first. The existing `/api/repositories/[id]/analysis` GET returns the
// last 20 runs unpaged; this is the run-history-page-friendly version
// (per page + offset + total).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant, assertOwnership } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { id } = await params;
    const repo = await db.repository.findUnique({ where: { id }, select: { tenantId: true } });
    const own = assertOwnership(repo, ctx);
    if (own) return own;

    const url = new URL(request.url);
    const pageSize = Math.min(
      Number(url.searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE
    );
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

    const [runs, total] = await Promise.all([
      db.analysisRun.findMany({
        where: { repositoryId: id },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: pageSize,
        select: {
          id: true,
          status: true,
          triggeredBy: true,
          startedAt: true,
          completedAt: true,
          duration: true,
          documentsGenerated: true,
          createdAt: true,
        },
      }),
      db.analysisRun.count({ where: { repositoryId: id } }),
    ]);

    return NextResponse.json({ runs, total, pageSize, offset });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
