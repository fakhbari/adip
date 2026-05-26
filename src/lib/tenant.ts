// Tenant boundary helpers.
//
// Every API route that touches a tenant-owned resource — Repository,
// RepositoryConnection, AIProvider, Setting, and the nested rows that
// hang off Repository (Document, ADR, AnalysisRun, TechnologyUsage) —
// must call `requireTenant(request)` first and then thread the tenantId
// into the Prisma where-clause.
//
// `requireTenant` returns `{ session, tenantId }` on success or a 401
// `NextResponse` you should return directly. The session is the standard
// NextAuth session shape extended with the `role` claim added in Phase 9.
//
// Why tenantId === userId for now:
//   - We have NextAuth User but no Organization model yet.
//   - The proposal envisions an Org concept (multi-user-per-tenant) but
//     until SSO + memberships land, every signed-in user IS their own
//     tenant. This keeps the API stable when we widen the model.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type AuthenticatedSession = {
  user: { id: string; email: string; name: string | null; role: string };
};

export type TenantContext = { session: AuthenticatedSession; tenantId: string };

/**
 * Resolve the calling tenant. Returns the context on success or a 401
 * NextResponse to be returned directly from the route handler.
 *
 * Usage in a route:
 *   const ctx = await requireTenant(request);
 *   if (ctx instanceof NextResponse) return ctx;
 *   const repos = await db.repository.findMany({ where: { tenantId: ctx.tenantId } });
 */
export async function requireTenant(_request: NextRequest | Request): Promise<TenantContext | NextResponse> {
  // `getServerSession` reads cookies via NextAuth; no need to pass req
  // explicitly in App Router server routes.
  const session = (await getServerSession(authOptions)) as AuthenticatedSession | null;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { session, tenantId: session.user.id };
}

/**
 * Assert that a fetched row belongs to the caller's tenant. 404 on mismatch
 * (not 403) to avoid leaking whether the resource exists in another tenant.
 */
export function assertOwnership(
  row: { tenantId: string } | null,
  ctx: TenantContext
): NextResponse | null {
  if (!row || row.tenantId !== ctx.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

/**
 * Compose a tenant filter into an existing Prisma `where` shape.
 *
 *   const where = withTenant({ isActive: true }, ctx);
 *   await db.repository.findMany({ where });
 *
 * Saves the `{ ...where, tenantId: ctx.tenantId }` boilerplate at every
 * call site and makes the dependency visible in code review.
 */
export function withTenant<W extends object>(where: W, ctx: TenantContext): W & { tenantId: string } {
  return { ...where, tenantId: ctx.tenantId };
}
