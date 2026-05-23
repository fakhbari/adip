import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { OpenAPIPage } from "@/components/openapi/openapi-page";

export default function OpenAPIRoute() {
  return (
    <DashboardLayout>
      <OpenAPIPage />
    </DashboardLayout>
  );
}
