import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ADRPage } from "@/components/adr/adr-page";

export default function ADRRoute() {
  return (
    <DashboardLayout>
      <ADRPage />
    </DashboardLayout>
  );
}
