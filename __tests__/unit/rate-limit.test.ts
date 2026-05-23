import { describe, it, expect, beforeEach } from "vitest";
import { consume, __resetForTests } from "../../src/lib/rate-limit";

beforeEach(() => __resetForTests());

describe("rate-limit.consume", () => {
  it("allows up to capacity in a burst", () => {
    const cfg = { capacity: 3, refillPerSec: 0 };
    expect(consume("k", cfg)).toBe(true);
    expect(consume("k", cfg)).toBe(true);
    expect(consume("k", cfg)).toBe(true);
    expect(consume("k", cfg)).toBe(false);
  });

  it("separates buckets by key", () => {
    const cfg = { capacity: 1, refillPerSec: 0 };
    expect(consume("alice", cfg)).toBe(true);
    expect(consume("bob", cfg)).toBe(true);
    expect(consume("alice", cfg)).toBe(false);
    expect(consume("bob", cfg)).toBe(false);
  });

  it("refills with elapsed time", async () => {
    const cfg = { capacity: 1, refillPerSec: 100 }; // very fast for the test
    expect(consume("k", cfg)).toBe(true);
    expect(consume("k", cfg)).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(consume("k", cfg)).toBe(true);
  });
});
