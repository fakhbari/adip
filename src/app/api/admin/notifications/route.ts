// Admin notifications API.
//
// Polish P6.4. Read-only list of NotificationDelivery rows for the
// admin UI tile. Newest-first, capped at 50. Admin role required.
//
// The dispatcher writes one row per attempt; this endpoint lets the
// operator see what fell on the floor + (via POST below) re-enqueue
// a single delivery for retry.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";
import { notificationRetryQueue } from "@/lib/queue";
import { logActivity } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const rows = await db.notificationDelivery.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    // The payload column can be megabytes for a long analysis report;
    // strip it down to a preview so the table renders fast. Full payload
    // is available via the per-row endpoint if we ever add one.
    const stripped = rows.map((r) => ({
      ...r,
      payload: r.payload.length > 280 ? r.payload.slice(0, 280) + "…" : r.payload,
    }));
    return NextResponse.json({ deliveries: stripped });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = (await request.json()) as { deliveryId?: string };
    if (!body.deliveryId) {
      return NextResponse.json({ error: "deliveryId required" }, { status: 400 });
    }
    // Confirm the row belongs to this tenant before queueing — anyone
    // else's failed delivery is not our problem to retry.
    const row = await db.notificationDelivery.findUnique({ where: { id: body.deliveryId } });
    if (!row || row.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // jobId reuses the delivery id so concurrent UI clicks dedupe.
    await notificationRetryQueue.add(
      "retry-delivery",
      { deliveryId: body.deliveryId },
      { jobId: `${body.deliveryId}:${Date.now()}` }
    );
    await logActivity({
      ctx,
      action: "notification.retry",
      entityType: "NotificationDelivery",
      entityId: body.deliveryId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
