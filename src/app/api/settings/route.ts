import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const connections = await db.repositoryConnection.findMany({
      orderBy: { createdAt: "desc" },
    });

    const schedules = await db.scheduleConfig.findMany({
      orderBy: { createdAt: "asc" },
    });

    const settings = await db.setting.findMany();

    // Build settings object
    const settingsObj = {
      aiProvider: settings.find((s) => s.key === "aiProvider")?.value || "claude",
      apiKey: settings.find((s) => s.key === "apiKey")?.value || "",
      notifications: {
        email: settings.find((s) => s.key === "notification_email")?.value === "true" ?? true,
        slack: settings.find((s) => s.key === "notification_slack")?.value === "true" ?? true,
        teams: settings.find((s) => s.key === "notification_teams")?.value === "false" ?? false,
      },
    };

    // Return defaults if no data
    if (connections.length === 0) {
      return NextResponse.json({
        connections: getDefaultConnections(),
        schedules: getDefaultSchedules(),
        settings: settingsObj,
      });
    }

    return NextResponse.json({
      connections: connections.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        url: c.url,
        isActive: c.isActive,
        lastSync: c.lastSync,
      })),
      schedules: schedules.length > 0 ? schedules.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        cronExpression: s.cronExpression,
        isActive: s.isActive,
        lastRun: s.lastRun,
        nextRun: s.nextRun,
      })) : getDefaultSchedules(),
      settings: settingsObj,
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({
      connections: getDefaultConnections(),
      schedules: getDefaultSchedules(),
      settings: {
        aiProvider: "claude",
        apiKey: "",
        notifications: {
          email: true,
          slack: true,
          teams: false,
        },
      },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { aiProvider, apiKey, notifications } = body;

    // Upsert settings
    if (aiProvider) {
      await db.setting.upsert({
        where: { key: "aiProvider" },
        update: { value: aiProvider },
        create: { key: "aiProvider", value: aiProvider, category: "ai" },
      });
    }

    if (apiKey) {
      await db.setting.upsert({
        where: { key: "apiKey" },
        update: { value: apiKey },
        create: { key: "apiKey", value: apiKey, category: "ai" },
      });
    }

    if (notifications) {
      await db.setting.upsert({
        where: { key: "notification_email" },
        update: { value: String(notifications.email) },
        create: { key: "notification_email", value: String(notifications.email), category: "notification" },
      });

      await db.setting.upsert({
        where: { key: "notification_slack" },
        update: { value: String(notifications.slack) },
        create: { key: "notification_slack", value: String(notifications.slack), category: "notification" },
      });

      await db.setting.upsert({
        where: { key: "notification_teams" },
        update: { value: String(notifications.teams) },
        create: { key: "notification_teams", value: String(notifications.teams), category: "notification" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}

function getDefaultConnections() {
  return [
    {
      id: "1",
      name: "Internal GitLab",
      type: "gitlab",
      url: "https://gitlab.company.com",
      isActive: true,
      lastSync: new Date(Date.now() - 3600000),
    },
  ];
}

function getDefaultSchedules() {
  return [
    {
      id: "1",
      name: "Full Scan",
      type: "full_scan",
      cronExpression: "0 2 * * 1,4",
      isActive: true,
      lastRun: new Date(Date.now() - 86400000),
      nextRun: new Date(Date.now() + 86400000),
    },
    {
      id: "2",
      name: "Quick Check",
      type: "quick_check",
      cronExpression: "0 6 * * *",
      isActive: true,
      lastRun: new Date(Date.now() - 3600000),
      nextRun: new Date(Date.now() + 82800000),
    },
  ];
}
