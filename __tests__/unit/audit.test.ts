import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db singleton so we can assert on what gets written without
// touching Postgres.
const created: Array<Record<string, unknown>> = [];

vi.mock("@/lib/db", () => ({
  db: {
    activityLog: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { id: "row", ...args.data };
      }),
    },
  },
}));

import { logActivity, logActivitySystem } from "../../src/lib/audit";
import type { TenantContext } from "../../src/lib/tenant";

beforeEach(() => {
  created.length = 0;
});

const ctx: TenantContext = {
  session: { user: { id: "user-1", email: "a@b", name: "A", role: "admin" } },
  tenantId: "user-1",
};

describe("logActivity", () => {
  it("writes tenantId + userId + action + details", async () => {
    await logActivity({
      ctx,
      action: "repository.create",
      entityType: "repository",
      entityId: "r1",
      details: { name: "demo" },
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      tenantId: "user-1",
      userId: "user-1",
      action: "repository.create",
      entityType: "repository",
      entityId: "r1",
    });
    expect(created[0].details).toBe(JSON.stringify({ name: "demo" }));
  });

  it("does not throw when the write fails", async () => {
    // Force the mock to throw on this call.
    const { db } = await import("@/lib/db");
    (db.activityLog.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("DB down")
    );
    await expect(
      logActivity({ ctx, action: "signout", entityType: "session" })
    ).resolves.toBeUndefined();
  });
});

describe("logActivitySystem", () => {
  it("writes a system row with null tenantId and 'system' userId", async () => {
    await logActivitySystem({
      action: "janitor.sweep",
      entityType: "analysisRun",
      details: { swept: 3 },
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      tenantId: null,
      userId: "system",
      action: "janitor.sweep",
    });
  });
});
