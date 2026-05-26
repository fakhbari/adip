// ScheduleConfig CRUD. Tenant boundary: schedules are global (not
// per-tenant) for now — they kick off scans across every active
// repository. When multi-tenant scheduling lands, add tenantId here.
//
// Phase 0.4: replaces the stub that the settings UI previously bound to.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { z } from "zod";

const ScheduleBody = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["full_scan", "quick_check"]),
  cronExpression: z.string().min(1).max(120),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;

  const schedules = await db.scheduleConfig.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(schedules);
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;

  const body = await request.json().catch(() => null);
  const parsed = ScheduleBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const created = await db.scheduleConfig.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      cronExpression: parsed.data.cronExpression,
      isActive: parsed.data.isActive ?? true,
    },
  });

  // The reconciler tick (worker side) picks this up within 5 minutes.
  return NextResponse.json(created, { status: 201 });
}
