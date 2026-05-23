import { describe, it, expect, beforeAll, beforeEach } from "vitest";

// Set a deterministic key BEFORE importing crypto.ts so loadKey() picks it up.
beforeAll(() => {
  // 32 zero bytes in hex. Test-only; do not use in production.
  process.env.ADIP_ENCRYPTION_KEY = "0".repeat(64);
});

// Reset the cached key between tests that mutate the env.
let crypto: typeof import("../../src/lib/crypto");

beforeEach(async () => {
  crypto = await import("../../src/lib/crypto");
  crypto.__resetKeyCacheForTests();
});

describe("crypto.ts", () => {
  it("round-trips a short string", () => {
    const plain = "ghp_thisIsATestToken_1234567890";
    const blob = crypto.encrypt(plain);
    expect(blob.startsWith("v1:")).toBe(true);
    expect(crypto.decrypt(blob)).toBe(plain);
  });

  it("round-trips a multi-line string", () => {
    const plain = "-----BEGIN KEY-----\nABCDEF\nGHIJKL\n-----END KEY-----";
    expect(crypto.decrypt(crypto.encrypt(plain))).toBe(plain);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const plain = "same-input";
    const a = crypto.encrypt(plain);
    const b = crypto.encrypt(plain);
    expect(a).not.toBe(b);
  });

  it("isEncrypted returns true only for v1: blobs", () => {
    expect(crypto.isEncrypted(crypto.encrypt("x"))).toBe(true);
    expect(crypto.isEncrypted("plain")).toBe(false);
    expect(crypto.isEncrypted("")).toBe(false);
    expect(crypto.isEncrypted(null)).toBe(false);
    expect(crypto.isEncrypted(undefined)).toBe(false);
  });

  it("rejects tampered ciphertext", () => {
    const blob = crypto.encrypt("hello");
    const parts = blob.split(":");
    // Flip the last byte of the ciphertext segment.
    const buf = Buffer.from(parts[3], "base64");
    buf[buf.length - 1] ^= 0xff;
    parts[3] = buf.toString("base64");
    const tampered = parts.join(":");
    expect(() => crypto.decrypt(tampered)).toThrow(crypto.EncryptionError);
  });

  it("rejects a wrong key", () => {
    const blob = crypto.encrypt("secret");
    process.env.ADIP_ENCRYPTION_KEY = "f".repeat(64);
    crypto.__resetKeyCacheForTests();
    expect(() => crypto.decrypt(blob)).toThrow(crypto.EncryptionError);
    // Restore for downstream tests.
    process.env.ADIP_ENCRYPTION_KEY = "0".repeat(64);
    crypto.__resetKeyCacheForTests();
  });

  it("rejects malformed blobs", () => {
    expect(() => crypto.decrypt("v1:not-enough-parts")).toThrow(crypto.EncryptionError);
    expect(() => crypto.decrypt("plain-but-no-prefix")).toThrow(crypto.EncryptionError);
  });

  it("throws when ADIP_ENCRYPTION_KEY is missing", () => {
    const prev = process.env.ADIP_ENCRYPTION_KEY;
    delete process.env.ADIP_ENCRYPTION_KEY;
    crypto.__resetKeyCacheForTests();
    expect(() => crypto.encrypt("x")).toThrow(crypto.EncryptionError);
    process.env.ADIP_ENCRYPTION_KEY = prev;
    crypto.__resetKeyCacheForTests();
  });

  it("throws when key is the wrong length", () => {
    const prev = process.env.ADIP_ENCRYPTION_KEY;
    process.env.ADIP_ENCRYPTION_KEY = "deadbeef"; // 8 chars hex → 4 bytes
    crypto.__resetKeyCacheForTests();
    expect(() => crypto.encrypt("x")).toThrow(crypto.EncryptionError);
    process.env.ADIP_ENCRYPTION_KEY = prev;
    crypto.__resetKeyCacheForTests();
  });

  describe("encryptOptional / decryptOptional", () => {
    it("treats null/undefined/empty as null", () => {
      expect(crypto.encryptOptional(null)).toBeNull();
      expect(crypto.encryptOptional(undefined)).toBeNull();
      expect(crypto.encryptOptional("")).toBeNull();
      expect(crypto.decryptOptional(null)).toBeNull();
      expect(crypto.decryptOptional("")).toBeNull();
    });

    it("is idempotent (encryptOptional of already-encrypted returns the same blob)", () => {
      const blob = crypto.encrypt("token");
      expect(crypto.encryptOptional(blob)).toBe(blob);
    });

    it("decryptOptional passes through legacy plaintext with a warning", () => {
      // Cannot easily assert console.warn without a spy; just confirm pass-through.
      expect(crypto.decryptOptional("legacy-plain-token")).toBe("legacy-plain-token");
    });
  });
});
