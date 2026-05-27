// Admin notifications page.
//
// Polish P6.4 — lists the last 50 NotificationDelivery rows for the
// signed-in tenant with status, channel, and a "Retry now" button on
// every failed row. Server shell gates non-admin users; the API also
// 403s as belt-and-suspenders.

import { PageShell } from "@/app/_lib/page-shell";
import { AdminNotificationsView } from "@/components/admin/notifications-view";

export const dynamic = "force-dynamic";

export default function AdminNotificationsPage() {
  return (
    <PageShell requireRole="admin">
      <AdminNotificationsView />
    </PageShell>
  );
}
