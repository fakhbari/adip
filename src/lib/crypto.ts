// Application-level encryption for secrets stored in the SQLite DB.
//
// We use AES-256-GCM with a 12-byte random IV per record. The key comes from
// the ADIP_ENCRYPTION_KEY environment variable (32 bytes, supplied as either
// 64 hex chars or a 44-char base64 string). All ciphertext is tagged with a
// version prefix `v1:` so we can change algorithms later without breaking
// reads.
//
// Wire format (single string column):
//   v1:<base64-iv>:<base64-tag>:<base64-ciphertext>
//
// Why GCM: authenticated encryption — tampered ciphertext throws on decrypt,
// rather than silently producing garbage that callers then pass to an
// external API. Why per-record IV: required for GCM with reused keys.

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const VERSION_PREFIX = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

let cachedKey: Buffer | null = null;

/**
 * Parse the encryption key from env. Accepts hex (64 chars) or base64 (44
 * padded chars). Throws on misconfiguration — never log the value.
 */
function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ADIP_ENCRYPTION_KEY;
  if (!raw) {
    throw new EncryptionError(
      "ADIP_ENCRYPTION_KEY is not set. Generate one with: " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"` " +
        "and put it in .env.local."
    );
  }

  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    // Treat anything else as base64. Buffer.from is lenient; we re-check length.
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== KEY_BYTES) {
    throw new EncryptionError(
      `ADIP_ENCRYPTION_KEY must be exactly ${KEY_BYTES} bytes (got ${key.length}). ` +
        `Use 64 hex chars or 44 base64 chars.`
    );
  }

  cachedKey = key;
  return key;
}

/**
 * Boot-time check. Call from any server-side bootstrap to fail closed.
 */
export function assertEncryptionKey(): void {
  loadKey();
}

/**
 * True if a string looks like our encrypted format. Used by migration scripts
 * to skip already-encrypted rows.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(VERSION_PREFIX);
}

/**
 * Encrypt a plaintext string. Returns the `v1:` blob.
 *
 * Edge cases:
 *   - empty string in → empty blob marker (still v1:, distinct from null).
 *   - null/undefined in → caller's responsibility; we don't store null.
 */
export function encrypt(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION_PREFIX.slice(0, -1), // "v1"
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a `v1:` blob. Throws EncryptionError on tampering, wrong key, or
 * malformed input.
 */
export function decrypt(blob: string): string {
  const key = loadKey();

  if (!isEncrypted(blob)) {
    throw new EncryptionError(
      "decrypt() received a value without the expected version prefix. " +
        "Was this row written before Phase 2 ran? Run scripts/migrate-encrypt-secrets.ts."
    );
  }

  const parts = blob.split(":");
  if (parts.length !== 4) {
    throw new EncryptionError("Encrypted blob is malformed (expected 4 colon-delimited parts).");
  }

  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");

  if (iv.length !== IV_BYTES) {
    throw new EncryptionError(`IV length is ${iv.length}, expected ${IV_BYTES}.`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new EncryptionError(`Auth tag length is ${tag.length}, expected ${TAG_BYTES}.`);
  }

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (err) {
    // Authentication failure — wrong key or tampered ciphertext. Do not leak the
    // underlying error (which can include partial plaintext on some platforms).
    throw new EncryptionError("Decryption failed (auth tag mismatch or wrong key).");
  }
}

/**
 * Convenience: encrypt only if a value is provided and not already encrypted.
 * Returns null when input is null/undefined/empty. Useful in route handlers.
 */
export function encryptOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (isEncrypted(value)) return value;
  return encrypt(value);
}

/**
 * Convenience: decrypt only if encrypted; pass through null/undefined as null.
 * Tolerates legacy plaintext rows (returns them as-is) to keep prod limping
 * along until the migration script runs. Logs a warning so it's visible.
 */
export function decryptOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!isEncrypted(value)) {
    console.warn(
      "decryptOptional: encountered plaintext secret in DB. " +
        "Run scripts/migrate-encrypt-secrets.ts to encrypt it."
    );
    return value;
  }
  return decrypt(value);
}

// Test-only hook to reset the key cache between tests that vary the env var.
export function __resetKeyCacheForTests(): void {
  cachedKey = null;
}
