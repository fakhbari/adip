import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { C4Page } from "@/components/c4/c4-page";

export default function C4Route() {
  return (
    <DashboardLayout>
      <C4Page />
    </DashboardLayout>
  );
}
