import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { RepositoriesPage } from "@/components/repositories/repositories-page";

export default function RepositoriesRoute() {
  return (
    <DashboardLayout>
      <RepositoriesPage />
    </DashboardLayout>
  );
}
