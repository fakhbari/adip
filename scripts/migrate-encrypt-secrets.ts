#!/usr/bin/env node
/**
 * One-shot migration: encrypt plaintext secrets in the SQLite DB.
 *
 * Idempotent — already-encrypted rows (prefix `v1:`) are skipped. Safe to run
 * multiple times. Reads ADIP_ENCRYPTION_KEY from the environment.
 *
 * Run with:
 *   npm run secrets:migrate
 * (or directly: `npx tsx scripts/migrate-encrypt-secrets.ts`)
 *
 * Touches:
 *   - RepositoryConnection.accessToken
 *   - AIProvider.apiKey
 *   - Setting where key='apiKey' (legacy single-user setting)
 */

import { db } from "../src/lib/db";
import { encrypt, isEncrypted, assertEncryptionKey } from "../src/lib/crypto";

type Counts = {
  scanned: number;
  alreadyEncrypted: number;
  encrypted: number;
  skippedEmpty: number;
};

async function migrateConnections(): Promise<Counts> {
  const counts: Counts = { scanned: 0, alreadyEncrypted: 0, encrypted: 0, skippedEmpty: 0 };
  const rows = await db.repositoryConnection.findMany({
    select: { id: true, accessToken: true },
  });
  for (const row of rows) {
    counts.scanned++;
    if (row.accessToken === null || row.accessToken === "") {
      counts.skippedEmpty++;
      continue;
    }
    if (isEncrypted(row.accessToken)) {
      counts.alreadyEncrypted++;
      continue;
    }
    await db.repositoryConnection.update({
      where: { id: row.id },
      data: { accessToken: encrypt(row.accessToken) },
    });
    counts.encrypted++;
  }
  return counts;
}

async function migrateAIProviders(): Promise<Counts> {
  const counts: Counts = { scanned: 0, alreadyEncrypted: 0, encrypted: 0, skippedEmpty: 0 };
  const rows = await db.aIProvider.findMany({ select: { id: true, apiKey: true } });
  for (const row of rows) {
    counts.scanned++;
    if (row.apiKey === null || row.apiKey === "") {
      counts.skippedEmpty++;
      continue;
    }
    if (isEncrypted(row.apiKey)) {
      counts.alreadyEncrypted++;
      continue;
    }
    await db.aIProvider.update({
      where: { id: row.id },
      data: { apiKey: encrypt(row.apiKey) },
    });
    counts.encrypted++;
  }
  return counts;
}

async function migrateSettingsApiKey(): Promise<Counts> {
  const counts: Counts = { scanned: 0, alreadyEncrypted: 0, encrypted: 0, skippedEmpty: 0 };
  const row = await db.setting.findUnique({ where: { key: "apiKey" } });
  if (!row) return counts;
  counts.scanned = 1;
  if (row.value === "") {
    counts.skippedEmpty = 1;
    return counts;
  }
  if (isEncrypted(row.value)) {
    counts.alreadyEncrypted = 1;
    return counts;
  }
  await db.setting.update({
    where: { key: "apiKey" },
    data: { value: encrypt(row.value) },
  });
  counts.encrypted = 1;
  return counts;
}

function pretty(label: string, c: Counts): string {
  return `  ${label}: scanned=${c.scanned}, encrypted=${c.encrypted}, alreadyEncrypted=${c.alreadyEncrypted}, skippedEmpty=${c.skippedEmpty}`;
}

async function main(): Promise<void> {
  assertEncryptionKey();
  console.log("ADIP secret migration — encrypting plaintext rows at rest.");

  const conn = await migrateConnections();
  console.log(pretty("RepositoryConnection.accessToken", conn));

  const ai = await migrateAIProviders();
  console.log(pretty("AIProvider.apiKey", ai));

  const setting = await migrateSettingsApiKey();
  console.log(pretty("Setting(key='apiKey').value", setting));

  const totalEncrypted = conn.encrypted + ai.encrypted + setting.encrypted;
  console.log(`\nDone. Newly encrypted: ${totalEncrypted}.`);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
