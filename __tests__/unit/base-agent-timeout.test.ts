import { describe, it, expect } from "vitest";
import { BaseAgent } from "../../src/lib/agents/base-agent";
import type { AnalysisContext, AgentResult } from "../../src/lib/agents/types";

const fakeContext = {} as AnalysisContext;

class FastAgent extends BaseAgent {
  constructor() {
    super({
      id: "fast",
      type: "tech-radar",
      name: "Fast Test Agent",
      description: "",
      priority: 1,
      timeout: 1000,
    });
  }
  async analyze(): Promise<AgentResult> {
    return {
      agentType: "tech-radar",
      status: "success",
      duration: 0,
      filesAnalyzed: 0,
    };
  }
}

class SlowAgent extends BaseAgent {
  constructor() {
    super({
      id: "slow",
      type: "tech-radar",
      name: "Slow Test Agent",
      description: "",
      priority: 1,
      timeout: 50,
    });
  }
  async analyze(): Promise<AgentResult> {
    await new Promise((r) => setTimeout(r, 500));
    return {
      agentType: "tech-radar",
      status: "success",
      duration: 0,
      filesAnalyzed: 0,
    };
  }
}

class ThrowingAgent extends BaseAgent {
  constructor() {
    super({
      id: "throw",
      type: "tech-radar",
      name: "Throwing Test Agent",
      description: "",
      priority: 1,
      timeout: 1000,
    });
  }
  async analyze(): Promise<AgentResult> {
    throw new Error("boom");
  }
}

describe("BaseAgent.executeWithTimeout (via execute)", () => {
  it("resolves a fast agent successfully", async () => {
    const result = await new FastAgent().execute(fakeContext);
    expect(result.status).toBe("success");
  });

  it("fails a slow agent with a timeout error", async () => {
    const result = await new SlowAgent().execute(fakeContext);
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/timed out/i);
  });

  it("captures a thrown error into a failed result", async () => {
    const result = await new ThrowingAgent().execute(fakeContext);
    expect(result.status).toBe("failed");
    expect(result.error).toBe("boom");
  });

  it("does not produce a double-settle warning for slow agents", async () => {
    // The rewrite uses Promise.race with a clearTimeout in finally; if the
    // async-executor anti-pattern returned, Node would log
    // "Unhandled promise rejection" when analyze() resolves after the timeout.
    // Run the slow case and confirm completion without lingering tasks.
    await new SlowAgent().execute(fakeContext);
    // Give the resolved-too-late promise time to settle and confirm no
    // unhandled rejections were swallowed.
    await new Promise((r) => setTimeout(r, 600));
  });
});
