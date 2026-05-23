import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContextMapPage } from "@/components/context-map/context-map-page";

export default function ContextMapRoute() {
  return (
    <DashboardLayout>
      <ContextMapPage />
    </DashboardLayout>
  );
}
