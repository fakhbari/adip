// Audit log page — Polish P1.7.

import { PageShell } from "@/app/_lib/page-shell";
import { AuditLogView } from "@/components/admin/audit-log-view";

export const dynamic = "force-dynamic";

export default function AuditLogPage() {
  return (
    <PageShell requireRole="admin">
      <AuditLogView />
    </PageShell>
  );
}
