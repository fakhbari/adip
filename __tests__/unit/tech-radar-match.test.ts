import { describe, it, expect } from "vitest";
import { TechRadarAgent } from "../../src/lib/agents/tech-radar-agent";

// Pull the private methods through a thin subclass. We don't want a public API
// for "tell me where this name maps" but we do want to lock down the matching
// rules against regression.
class Probe extends TechRadarAgent {
  matchTechInfo(name: string) {
    // @ts-expect-error — accessing protected helper for test only.
    return this.getTechInfo(name);
  }
  matchRing(name: string) {
    // @ts-expect-error — accessing protected helper for test only.
    return this.determineRadarRing({
      name,
      category: "X",
      quadrant: "tools",
      ring: "assess",
      sourceFile: "x",
      confidence: 1,
    });
  }
}

const probe = new Probe();

describe("TechRadarAgent.getTechInfo (no false positives)", () => {
  it("matches an exact entry", () => {
    expect(probe.matchTechInfo("react")?.category).toBe("Frontend Framework");
  });

  it("matches a scoped package by suffix", () => {
    // @aws-sdk/foo → normalized to "foo" via the `@scope/` strip. The mapping
    // entry `@aws-sdk` is also in the table; this test exercises the prefix.
    expect(probe.matchTechInfo("@aws-sdk/client-s3")?.category).toBe("Cloud Provider");
  });

  it("does NOT match react-native against react", () => {
    // react-native is not in the table; the previous bug surfaced it as "react".
    expect(probe.matchTechInfo("react-native")).toBeNull();
  });

  it("matches next-auth against its own entry, NOT against next", () => {
    // next-auth has its own entry in TECHNOLOGY_CATEGORIES (Authentication).
    // The regression test is: it must NOT be classified as the Full-stack
    // Framework that `next` maps to.
    const info = probe.matchTechInfo("next-auth");
    expect(info?.category).toBe("Authentication");
    expect(info?.category).not.toBe("Full-stack Framework");
  });

  it("does NOT match typescript against pg", () => {
    // "typescript" includes "pg" only as a substring at no separator boundary;
    // the previous bidirectional includes() matched it.
    expect(probe.matchTechInfo("typescript")).toBeNull();
  });
});

describe("TechRadarAgent.determineRadarRing", () => {
  it("places react in adopt", () => {
    expect(probe.matchRing("react")).toBe("adopt");
  });

  it("places next in adopt", () => {
    expect(probe.matchRing("next")).toBe("adopt");
  });

  it("places next-auth in assess (not adopt)", () => {
    expect(probe.matchRing("next-auth")).toBe("assess");
  });

  it("places react-native in assess (not adopt)", () => {
    expect(probe.matchRing("react-native")).toBe("assess");
  });

  it("places vitest in trial", () => {
    expect(probe.matchRing("vitest")).toBe("trial");
  });

  it("places moment in hold", () => {
    expect(probe.matchRing("moment")).toBe("hold");
  });
});
