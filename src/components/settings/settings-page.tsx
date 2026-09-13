"use client";

import { useEffect, useState } from "react";
import {
  GitBranch,
  Clock,
  Key,
  Save,
  RefreshCw,
  ScrollText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiProviderTab } from "./AiProviderTab";
import RulesTab from "@/components/settings/RulesTab";
import ConnectionsTab from "@/components/settings/ConnectionsTab";
import SchedulerTab from "@/components/settings/SchedulerTab";
import {RepositoryConnection , ScheduleConfig , Settings} from "@/app/types/types";

interface SettingsData {
  connections: RepositoryConnection[];
  schedules: ScheduleConfig[];
  settings: Settings;
}

export function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/settings");
        const result = await response.json();
        setData(result);
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data?.settings),
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Configure ADIP system settings and integrations
          </p>
        </div>
        <Button onClick={handleSaveSettings} disabled={isSaving} >
          {isSaving ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="connections" className="space-y-4">
        <TabsList>
          <TabsTrigger value="connections">
            <GitBranch className="mr-2 h-4 w-4" />
            Connections
          </TabsTrigger>
          <TabsTrigger value="scheduler">
            <Clock className="mr-2 h-4 w-4" />
            Scheduler
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Key className="mr-2 h-4 w-4" />
            AI Provider
          </TabsTrigger>
          <TabsTrigger value="rules">
            <ScrollText className="mr-2 h-4 w-4" />
            Rules
          </TabsTrigger>
        </TabsList>

        {/* Repository Connections */}
        <TabsContent value="connections">
          <ConnectionsTab data={data} setData={setData} />
        </TabsContent>

        {/* Scheduler */}
        <TabsContent value="scheduler">
          <SchedulerTab data={data} />
        </TabsContent>

        {/* AI Provider */}
        <TabsContent value="ai">
          <AiProviderTab />
        </TabsContent>

        {/* Rules */}
        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>

      </Tabs>
    </div>
  );
}
