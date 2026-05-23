import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { TechRadarPage } from "@/components/radar/tech-radar-page";

export default function RadarRoute() {
  return (
    <DashboardLayout>
      <TechRadarPage />
    </DashboardLayout>
  );
}
