// Notification webhook settings.
//
// Polish P2.7. GET returns the slack/teams webhook URLs in masked form;
// PUT upserts them. Each value is encrypted at rest via encryptOptional.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";
import { encryptOptional, decryptOptional } from "@/lib/crypto";
import { logActivity } from "@/lib/audit";

const KEYS = ["slack_webhook_url", "teams_webhook_url"] as const;

function maskUrl(url: string | null): string {
  if (!url) return "";
  // Keep just the host + a hash-ish tail so the admin can identify what's set.
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/…/${url.slice(-6)}`;
  } catch {
    return url.length > 16 ? `…${url.slice(-8)}` : url;
  }
}

export async function GET(request: NextRequest) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const rows = await db.setting.findMany({
      where: { tenantId: ctx.tenantId, key: { in: [...KEYS] } },
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return NextResponse.json({
      slack_webhook_url: {
        configured: byKey.has("slack_webhook_url"),
        masked: maskUrl(decryptOptional(byKey.get("slack_webhook_url") ?? null)),
      },
      teams_webhook_url: {
        configured: byKey.has("teams_webhook_url"),
        masked: maskUrl(decryptOptional(byKey.get("teams_webhook_url") ?? null)),
      },
    });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}

export async function PUT(request: NextRequest) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = (await request.json()) as { slack_webhook_url?: string | null; teams_webhook_url?: string | null };
    for (const key of KEYS) {
      const incoming = body[key];
      if (incoming === undefined) continue; // omit = no change
      if (incoming === null || incoming === "") {
        await db.setting.deleteMany({ where: { tenantId: ctx.tenantId, key } });
      } else {
        const encrypted = encryptOptional(incoming);
        if (!encrypted) continue;
        await db.setting.upsert({
          where: { tenantId_key: { tenantId: ctx.tenantId, key } },
          create: { tenantId: ctx.tenantId, key, value: encrypted, category: "notification" },
          update: { value: encrypted },
        });
      }
      await logActivity({ ctx, action: "webhook.set", entityType: "Setting", entityId: key });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
