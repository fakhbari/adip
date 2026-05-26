// Server-side page shell for tenant-gated routes.
//
// Polish Phase A (P1.1). The new pages from P1.2 / P1.3 / P1.4 / P1.5 /
// P1.6 / P1.7 / P1.8 all need to:
//   1. resolve the NextAuth session,
//   2. redirect to /auth/signin when there is none (the middleware
//      already does this, but a server-shell guard keeps RSC pages
//      safe even if the middleware is misconfigured),
//   3. wrap the actual page body in the existing DashboardLayout
//      sidebar + header.
//
// This component encapsulates that boilerplate so every new page is
// effectively `export default () => <PageShell><MyView /></PageShell>`.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

type Session = {
  user?: { id?: string; email?: string | null; name?: string | null; role?: string };
} | null;

export type PageShellProps = {
  children: React.ReactNode;
  /** If set, the page only renders for users with one of these roles. */
  requireRole?: "admin" | Array<"admin" | "user">;
  /** Where to send a non-permitted user. Defaults to /dashboard. */
  forbiddenRedirect?: string;
};

export async function PageShell({
  children,
  requireRole,
  forbiddenRedirect = "/dashboard",
}: PageShellProps) {
  const session: Session = (await getServerSession(authOptions)) as Session;

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  if (requireRole) {
    const allowed = Array.isArray(requireRole) ? requireRole : [requireRole];
    if (!allowed.includes((session!.user!.role as "admin" | "user") ?? "user")) {
      redirect(forbiddenRedirect);
    }
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
