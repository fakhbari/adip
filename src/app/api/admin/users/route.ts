// Admin users API.
//
// Polish P1.6. GET lists users (admin can see everyone for now — the
// product still has a single shared tenant boundary). POST creates an
// invite-like row with a generated temporary password the admin must
// hand to the invitee. SSO + a real invite-by-email flow are out of
// scope.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";
import { logActivity } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ users });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const body = (await request.json()) as { email?: string; name?: string; role?: "admin" | "user" };
    if (!body.email || typeof body.email !== "string") {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    const email = body.email.trim().toLowerCase();
    const role = body.role === "admin" ? "admin" : "user";

    const tempPassword = randomBytes(12).toString("base64url");
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await db.user.create({
      data: {
        email,
        name: body.name ?? null,
        role,
        passwordHash,
        isActive: true,
      },
      select: { id: true, email: true, role: true, name: true },
    });

    await logActivity({
      ctx,
      action: "user.invite",
      entityType: "User",
      entityId: user.id,
      details: { email, role },
    });

    // Surface the temporary password ONCE so the admin can hand it to the
    // invitee. We do not email it to avoid wiring SMTP at this stage.
    return NextResponse.json({ user, tempPassword });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
