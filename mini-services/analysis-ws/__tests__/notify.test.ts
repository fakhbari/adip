import { describe, it, expect } from "vitest";
import { validateNotify } from "../notify";

const TOKEN = "test-token-32-bytes-of-entropy-xy";

function makeInput(overrides: Partial<Parameters<typeof validateNotify>[0]>) {
  return validateNotify({
    method: "POST",
    url: "/notify/progress",
    headers: { "x-internal-token": TOKEN },
    body: JSON.stringify({ analysisRunId: "run1", repositoryId: "repo1", progress: {} }),
    internalToken: TOKEN,
    ...overrides,
  });
}

describe("validateNotify", () => {
  it("accepts a valid progress payload", () => {
    const r = makeInput({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.action).toBe("progress");
      expect(r.payload.analysisRunId).toBe("run1");
    }
  });

  it("returns 404 for wrong method", () => {
    const r = makeInput({ method: "GET" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it("returns 404 for non-/notify path", () => {
    const r = makeInput({ url: "/anything-else" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it("returns 401 when token is missing entirely", () => {
    const r = makeInput({ headers: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("returns 401 when token does not match", () => {
    const r = makeInput({ headers: { "x-internal-token": "wrong" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("returns 401 when the server has no token configured", () => {
    // Even with the right-looking header, an unconfigured server must refuse.
    const r = makeInput({ internalToken: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("returns 400 for an unknown action", () => {
    const r = makeInput({ url: "/notify/banana" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("returns 400 for malformed JSON", () => {
    const r = makeInput({ body: "{not-json" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("returns 400 for a payload that fails schema", () => {
    const r = makeInput({ body: JSON.stringify({ analysisRunId: "" }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("accepts a valid complete payload", () => {
    const r = makeInput({
      url: "/notify/complete",
      body: JSON.stringify({
        analysisRunId: "r",
        repositoryId: "p",
        status: "ok",
        documentsGenerated: 3,
      }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action).toBe("complete");
  });

  it("accepts a valid error payload", () => {
    const r = makeInput({
      url: "/notify/error",
      body: JSON.stringify({ analysisRunId: "r", repositoryId: "p", error: "boom" }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action).toBe("error");
  });

  it("accepts a valid llm-delta payload", () => {
    const r = makeInput({
      url: "/notify/llm-delta",
      body: JSON.stringify({ analysisRunId: "r", repositoryId: "p", agentType: "adr", delta: "hello" }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action).toBe("llm-delta");
  });

  it("accepts a valid agent-event payload", () => {
    const r = makeInput({
      url: "/notify/agent-event",
      body: JSON.stringify({ analysisRunId: "r", repositoryId: "p", type: "agent-start", agentType: "c4" }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action).toBe("agent-event");
  });

  it("ignores duplicate header value (array form)", () => {
    // node http may surface duplicate headers as arrays. Our validator should
    // reject — we expect a single string.
    const r = makeInput({ headers: { "x-internal-token": [TOKEN, "extra"] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });
});
