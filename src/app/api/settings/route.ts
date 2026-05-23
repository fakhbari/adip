import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptOptional } from "@/lib/crypto";

// GET /api/settings returns app-wide settings. Secrets (apiKey) are NEVER
// returned. Callers get a boolean `hasApiKey` instead — Phase 2 fix for a
// previous leak where the plaintext key was echoed back.
export async function GET(_request: NextRequest) {
  try {
    const connections = await db.repositoryConnection.findMany({
      orderBy: { createdAt: "desc" },
    });

    const schedules = await db.scheduleConfig.findMany({
      orderBy: { createdAt: "asc" },
    });

    const settings = await db.setting.findMany();

    const apiKeyRow = settings.find((s) => s.key === "apiKey")?.value ?? null;

    const settingsObj = {
      aiProvider: settings.find((s) => s.key === "aiProvider")?.value || "claude",
      hasApiKey: apiKeyRow !== null && apiKeyRow !== "",
      notifications: {
        email: (settings.find((s) => s.key === "notification_email")?.value ?? "true") === "true",
        slack: (settings.find((s) => s.key === "notification_slack")?.value ?? "true") === "true",
        teams: (settings.find((s) => s.key === "notification_teams")?.value ?? "false") === "true",
      },
    };

    return NextResponse.json({
      // Strip accessToken; this endpoint is for the settings UI which does not
      // need it. See settings/connections/route.ts for the dedicated CRUD path.
      connections: connections.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        url: c.url,
        isActive: c.isActive,
        lastSync: c.lastSync,
        hasAccessToken: c.accessToken !== null && c.accessToken !== "",
      })),
      schedules: schedules.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        cronExpression: s.cronExpression,
        isActive: s.isActive,
        lastRun: s.lastRun,
        nextRun: s.nextRun,
      })),
      settings: settingsObj,
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { aiProvider, apiKey, notifications } = body;

    if (aiProvider) {
      await db.setting.upsert({
        where: { key: "aiProvider" },
        update: { value: aiProvider },
        create: { key: "aiProvider", value: aiProvider, category: "ai" },
      });
    }

    // Encrypt the apiKey before persisting into Setting.value (Phase 2).
    // An empty string clears the key (write a null-equivalent empty value
    // is avoided by simply not writing when the field is empty).
    if (apiKey !== undefined) {
      if (apiKey === "") {
        await db.setting.deleteMany({ where: { key: "apiKey" } });
      } else {
        const encrypted = encryptOptional(apiKey);
        if (encrypted) {
          await db.setting.upsert({
            where: { key: "apiKey" },
            update: { value: encrypted },
            create: { key: "apiKey", value: encrypted, category: "ai" },
          });
        }
      }
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
