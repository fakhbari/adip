import { describe, it, expect, beforeEach } from "vitest";
import { PromptRegistry, interpolate } from "../../src/lib/llm/prompt-registry";

beforeEach(() => PromptRegistry.__resetCacheForTests());

describe("PromptRegistry", () => {
  it("renders the C4 level1 en template with vars", async () => {
    const out = await PromptRegistry.render({
      agent: "c4",
      task: "level1",
      locale: "en",
      vars: {
        repoName: "demo",
        repoDescription: "d",
        languages: "TypeScript",
        frameworks: "Next.js",
        techList: "x",
        manifests: "",
      },
    });
    expect(out).toContain("demo");
    expect(out).toContain("TypeScript");
    expect(out).toContain("Next.js");
  });

  it("renders the fa template in Persian", async () => {
    const out = await PromptRegistry.render({
      agent: "c4",
      task: "level1",
      locale: "fa",
      vars: {
        repoName: "x",
        repoDescription: "y",
        languages: "",
        frameworks: "",
        techList: "",
        manifests: "",
      },
    });
    // Persian word for "repository".
    expect(out).toContain("مخزن");
  });
});

describe("interpolate", () => {
  it("substitutes single-pass", () => {
    expect(interpolate("Hello {{name}}!", { name: "ada" })).toBe("Hello ada!");
  });

  it("leaves unknown vars blank", () => {
    expect(interpolate("a={{x}} b={{y}}", { x: "1" })).toBe("a=1 b=");
  });

  it("does not re-interpolate values containing braces", () => {
    expect(interpolate("{{x}}", { x: "{{y}}" })).toBe("{{y}}");
  });
});
