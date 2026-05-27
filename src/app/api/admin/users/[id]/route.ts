// Per-user admin actions.
//
// Polish P1.6. PATCH supports `role` and `isActive` toggles. DELETE is
// soft (sets isActive=false) — we never delete a row because audit
// references would dangle.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";
import { logActivity } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { id } = await params;
    const body = (await request.json()) as { role?: "admin" | "user"; isActive?: boolean };
    if (id === ctx.session.user.id && body.role && body.role !== "admin") {
      // Guard against an admin demoting themselves and locking the tenant
      // out of admin actions.
      return NextResponse.json({ error: "Cannot demote your own admin role." }, { status: 400 });
    }
    if (id === ctx.session.user.id && body.isActive === false) {
      return NextResponse.json({ error: "Cannot deactivate yourself." }, { status: 400 });
    }
    const data: { role?: string; isActive?: boolean } = {};
    if (body.role) data.role = body.role;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No changes." }, { status: 400 });
    }
    const updated = await db.user.update({
      where: { id },
      data,
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (data.role) {
      await logActivity({ ctx, action: "user.role.change", entityType: "User", entityId: id, details: { role: data.role } });
    }
    if (data.isActive === false) {
      await logActivity({ ctx, action: "user.deactivate", entityType: "User", entityId: id });
    } else if (data.isActive === true) {
      await logActivity({ ctx, action: "user.reactivate", entityType: "User", entityId: id });
    }
    return NextResponse.json({ user: updated });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const { id } = await params;
    if (id === ctx.session.user.id) {
      return NextResponse.json({ error: "Cannot delete yourself." }, { status: 400 });
    }
    await db.user.update({ where: { id }, data: { isActive: false } });
    await logActivity({ ctx, action: "user.deactivate", entityType: "User", entityId: id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
