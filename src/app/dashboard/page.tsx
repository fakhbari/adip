import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export default function DashboardRoute() {
  return (
    <DashboardLayout>
      <DashboardOverview />
    </DashboardLayout>
  );
}
