// Account password change.
//
// Polish P1.6. Any signed-in user can change their own password. Verifies
// the current password before accepting the new one to avoid hijack of a
// stolen session token.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";
import { logActivity } from "@/lib/audit";
import bcrypt from "bcryptjs";

const MIN_LENGTH = 12;

export async function POST(request: NextRequest) {
  const ctx = await requireTenant(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = (await request.json()) as { current?: string; next?: string };
    if (!body.current || !body.next) {
      return NextResponse.json({ error: "Both current and next passwords are required." }, { status: 400 });
    }
    if (body.next.length < MIN_LENGTH) {
      return NextResponse.json({ error: `New password must be at least ${MIN_LENGTH} characters.` }, { status: 400 });
    }
    const user = await db.user.findUnique({ where: { id: ctx.session.user.id } });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Password change is not available for this account." }, { status: 400 });
    }
    const ok = await bcrypt.compare(body.current, user.passwordHash);
    if (!ok) {
      // Slightly opaque — do not confirm "wrong current password" vs
      // "account state issue".
      return NextResponse.json({ error: "Could not change password." }, { status: 400 });
    }
    const hash = await bcrypt.hash(body.next, 10);
    await db.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
    await logActivity({ ctx, action: "password.change", entityType: "User", entityId: user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
