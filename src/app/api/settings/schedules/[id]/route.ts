// Per-schedule mutations.
//
// Polish P2.8: PATCH supports inline `isActive` toggle without other
// fields; cron validation rejects invalid expressions; every mutation
// emits an audit row.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { z } from "zod";
import { mapErrorToResponse } from "@/lib/api-errors";
import { logActivity } from "@/lib/audit";
import { parseExpression } from "cron-parser";

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(["full_scan", "quick_check"]).optional(),
  cronExpression: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

function validateCron(expr: string): string | null {
  try {
    parseExpression(expr);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return mutate(request, params);
}

// Polish P2.8 — PATCH alias for the same operation so the UI's inline
// toggle can send the minimum body.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return mutate(request, params);
}

async function mutate(request: NextRequest, params: Promise<{ id: string }>) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = PatchBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    if (parsed.data.cronExpression) {
      const cronErr = validateCron(parsed.data.cronExpression);
      if (cronErr) return NextResponse.json({ error: `Invalid cron expression: ${cronErr}` }, { status: 400 });
    }
    const updated = await db.scheduleConfig.update({ where: { id }, data: parsed.data });
    const action: "schedule.toggle" | "schedule.update" =
      Object.keys(parsed.data).length === 1 && "isActive" in parsed.data ? "schedule.toggle" : "schedule.update";
    await logActivity({ ctx, action, entityType: "ScheduleConfig", entityId: id, details: parsed.data as Record<string, unknown> });
    return NextResponse.json(updated);
  } catch (err) {
    return mapErrorToResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { id } = await params;
    await db.scheduleConfig.delete({ where: { id } });
    await logActivity({ ctx, action: "schedule.delete", entityType: "ScheduleConfig", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
