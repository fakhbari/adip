// ScheduleConfig CRUD. Tenant boundary: schedules are global (not
// per-tenant) for now — they kick off scans across every active
// repository. When multi-tenant scheduling lands, add tenantId here.
//
// Phase 0.4: replaces the stub that the settings UI previously bound to.
// Polish P2.8: cron expression now validated server-side + every mutation
// emits an audit row.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { z } from "zod";
import { mapErrorToResponse } from "@/lib/api-errors";
import { logActivity } from "@/lib/audit";
import { parseExpression } from "cron-parser";

const ScheduleBody = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["full_scan", "quick_check"]),
  cronExpression: z.string().min(1).max(120),
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

export async function GET(request: NextRequest) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;

  const schedules = await db.scheduleConfig.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(schedules);
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const body = await request.json().catch(() => null);
    const parsed = ScheduleBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
    }
    const cronErr = validateCron(parsed.data.cronExpression);
    if (cronErr) {
      return NextResponse.json({ error: `Invalid cron expression: ${cronErr}` }, { status: 400 });
    }

    const created = await db.scheduleConfig.create({
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        cronExpression: parsed.data.cronExpression,
        isActive: parsed.data.isActive ?? true,
      },
    });
    await logActivity({ ctx, action: "schedule.create", entityType: "ScheduleConfig", entityId: created.id, details: { name: created.name, cronExpression: created.cronExpression } });

    // The reconciler tick (worker side) picks this up within 5 minutes.
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
