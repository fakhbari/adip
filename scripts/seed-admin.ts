#!/usr/bin/env node
/**
 * Seed a single admin user. Idempotent — running twice is safe; the existing
 * user's password is updated to match the latest env value.
 *
 * Required env vars:
 *   ADIP_ADMIN_EMAIL     — e.g. admin@example.com
 *   ADIP_ADMIN_PASSWORD  — plaintext password (will be bcrypt-hashed)
 *
 * Usage:
 *   ADIP_ADMIN_EMAIL=… ADIP_ADMIN_PASSWORD=… npx tsx scripts/seed-admin.ts
 */

import { db } from "../src/lib/db";
import bcrypt from "bcryptjs";

async function main() {
  const email = process.env.ADIP_ADMIN_EMAIL;
  const password = process.env.ADIP_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("ADIP_ADMIN_EMAIL and ADIP_ADMIN_PASSWORD must be set.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    create: {
      email: email.toLowerCase(),
      name: "Admin",
      role: "admin",
      passwordHash,
    },
    update: {
      passwordHash,
      role: "admin",
    },
  });

  console.log(`Admin user ready: ${user.email} (id=${user.id})`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
