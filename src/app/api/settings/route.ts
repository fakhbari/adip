import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptOptional } from "@/lib/crypto";
import { requireTenant, withTenant } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";

// Per-tenant settings. Setting now has a composite unique [tenantId, key]
// — the upserts use the compound where shape `tenantId_key`.
//
// Secrets (apiKey) are NEVER returned. Callers get a boolean `hasApiKey`.

function settingWhere(tenantId: string, key: string) {
  return { tenantId_key: { tenantId, key } };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireTenant(request);
    if (ctx instanceof NextResponse) return ctx;

    const connections = await db.repositoryConnection.findMany({
      where: withTenant({}, ctx),
      orderBy: { createdAt: "desc" },
    });

    const schedules = await db.scheduleConfig.findMany({
      orderBy: { createdAt: "asc" },
    });

    const settings = await db.setting.findMany({
      where: withTenant({}, ctx),
    });

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
    return mapErrorToResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireTenant(request);
    if (ctx instanceof NextResponse) return ctx;

    // Polish Phase C (P3.2): malformed body → 400 INVALID_JSON via the
    // structured envelope, instead of crashing the route.
    let body: { aiProvider?: string; apiKey?: string; notifications?: { email?: boolean; slack?: boolean; teams?: boolean } };
    try {
      body = await request.json();
    } catch (err) {
      return mapErrorToResponse(err);
    }
    const { aiProvider, apiKey, notifications } = body ?? {};

    if (aiProvider) {
      await db.setting.upsert({
        where: settingWhere(ctx.tenantId, "aiProvider"),
        update: { value: aiProvider },
        create: { tenantId: ctx.tenantId, key: "aiProvider", value: aiProvider, category: "ai" },
      });
    }

    if (apiKey !== undefined) {
      if (apiKey === "") {
        await db.setting.deleteMany({ where: withTenant({ key: "apiKey" }, ctx) });
      } else {
        const encrypted = encryptOptional(apiKey);
        if (encrypted) {
          await db.setting.upsert({
            where: settingWhere(ctx.tenantId, "apiKey"),
            update: { value: encrypted },
            create: { tenantId: ctx.tenantId, key: "apiKey", value: encrypted, category: "ai" },
          });
        }
      }
    }

    if (notifications) {
      for (const [key, value] of [
        ["notification_email", String(notifications.email)],
        ["notification_slack", String(notifications.slack)],
        ["notification_teams", String(notifications.teams)],
      ] as const) {
        await db.setting.upsert({
          where: settingWhere(ctx.tenantId, key),
          update: { value },
          create: { tenantId: ctx.tenantId, key, value, category: "notification" },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
