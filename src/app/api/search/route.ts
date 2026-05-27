// Global header search.
//
// Polish P2.2. `GET /api/search?q=...` returns up to 10 matches across
// repositories and documents for the calling tenant. Case-insensitive,
// 2-char minimum to avoid one-letter floods.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant, withTenant } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";

const MIN_QUERY_LENGTH = 2;
const PER_BUCKET = 5;

export async function GET(request: NextRequest) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (q.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({ repositories: [], documents: [] });
    }

    const [repos, docs] = await Promise.all([
      db.repository.findMany({
        where: withTenant({ name: { contains: q, mode: "insensitive" as const } }, ctx),
        select: { id: true, name: true, description: true },
        take: PER_BUCKET,
      }),
      db.document.findMany({
        where: {
          repository: withTenant({}, ctx),
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { content: { contains: q, mode: "insensitive" as const } },
          ],
        },
        select: { id: true, type: true, title: true, repositoryId: true, repository: { select: { name: true } } },
        take: PER_BUCKET,
      }),
    ]);

    return NextResponse.json({
      repositories: repos,
      documents: docs.map((d) => ({
        id: d.id,
        type: d.type,
        title: d.title,
        repositoryId: d.repositoryId,
        repositoryName: d.repository.name,
      })),
    });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
