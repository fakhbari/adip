import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { z } from "zod";

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(["full_scan", "quick_check"]).optional(),
  cronExpression: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const updated = await db.scheduleConfig.update({ where: { id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  await db.scheduleConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
