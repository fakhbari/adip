// User management page — Polish P1.6.

import { PageShell } from "@/app/_lib/page-shell";
import { UsersView } from "@/components/admin/users-view";

export const dynamic = "force-dynamic";

export default function UsersPage() {
  return (
    <PageShell requireRole="admin">
      <UsersView />
    </PageShell>
  );
}
