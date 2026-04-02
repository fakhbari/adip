"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { RepositoriesPage } from "@/components/repositories/repositories-page";
import { TechRadarPage } from "@/components/radar/tech-radar-page";
import { ADRPage } from "@/components/adr/adr-page";
import { C4Page } from "@/components/c4/c4-page";
import { OpenAPIPage } from "@/components/openapi/openapi-page";
import { ContextMapPage } from "@/components/context-map/context-map-page";
import { SettingsPage } from "@/components/settings/settings-page";

type ViewType = "dashboard" | "repositories" | "radar" | "adr" | "c4" | "openapi" | "context-map" | "settings";

export default function Home() {
  const [activeView, setActiveView] = useState<ViewType>("dashboard");

  const renderContent = () => {
    switch (activeView) {
      case "dashboard":
        return <DashboardOverview />;
      case "repositories":
        return <RepositoriesPage />;
      case "radar":
        return <TechRadarPage />;
      case "adr":
        return <ADRPage />;
      case "c4":
        return <C4Page />;
      case "openapi":
        return <OpenAPIPage />;
      case "context-map":
        return <ContextMapPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <DashboardLayout activeView={activeView} onViewChange={setActiveView}>
      {renderContent()}
    </DashboardLayout>
  );
}
