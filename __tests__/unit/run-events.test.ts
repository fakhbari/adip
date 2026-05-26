import { describe, it, expect, vi, beforeEach } from "vitest";

const created: Array<Record<string, unknown>> = [];

vi.mock("@/lib/db", () => ({
  db: {
    runEvent: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { id: "ev", ...args.data };
      }),
      findMany: vi.fn(async () => []),
    },
  },
}));

import { recordRunEvent } from "../../src/lib/run-events";

beforeEach(() => {
  created.length = 0;
});

describe("recordRunEvent", () => {
  it("writes a string content as-is", async () => {
    await recordRunEvent({
      analysisRunId: "run-1",
      type: "llm-prompt",
      role: "system",
      content: "you are a helpful agent",
    });
    expect(created[0]).toMatchObject({
      analysisRunId: "run-1",
      type: "llm-prompt",
      role: "system",
      content: "you are a helpful agent",
    });
  });

  it("JSON-stringifies object content", async () => {
    await recordRunEvent({
      analysisRunId: "run-1",
      type: "agent-end",
      agentType: "tech-radar",
      content: { duration: 1234, status: "success" },
    });
    expect(created[0].content).toBe(
      JSON.stringify({ duration: 1234, status: "success" })
    );
  });

  it("omits content when not provided", async () => {
    await recordRunEvent({ analysisRunId: "run-1", type: "run-start" });
    expect(created[0]).toMatchObject({
      analysisRunId: "run-1",
      type: "run-start",
      content: null,
    });
  });

  it("does not throw on write failure", async () => {
    const { db } = await import("@/lib/db");
    (db.runEvent.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("DB down")
    );
    await expect(
      recordRunEvent({ analysisRunId: "run-1", type: "run-failed" })
    ).resolves.toBeUndefined();
  });
});
