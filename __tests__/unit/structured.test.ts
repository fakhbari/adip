import { describe, it, expect } from "vitest";
import { z } from "zod";
import { runWithSchema, SchemaValidationError } from "../../src/lib/llm/structured";
import type { LLMProvider } from "../../src/lib/llm/provider";

function mockProvider(responses: string[]): LLMProvider {
  let i = 0;
  return {
    kind: "mock",
    model: "test",
    async chat() {
      const content = responses[Math.min(i, responses.length - 1)];
      i++;
      return {
        content,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: "stop",
      };
    },
  };
}

const Schema = z.object({ name: z.string(), value: z.number() });

describe("runWithSchema", () => {
  it("returns valid response on first try", async () => {
    const provider = mockProvider(['{"name":"a","value":1}']);
    const out = await runWithSchema({
      provider,
      messages: [{ role: "user", content: "go" }],
      schema: Schema,
    });
    expect(out.data).toEqual({ name: "a", value: 1 });
    expect(out.attempts).toBe(1);
  });

  it("strips ```json fences", async () => {
    const provider = mockProvider(['```json\n{"name":"a","value":2}\n```']);
    const out = await runWithSchema({
      provider,
      messages: [{ role: "user", content: "go" }],
      schema: Schema,
    });
    expect(out.data).toEqual({ name: "a", value: 2 });
  });

  it("retries on schema mismatch and accepts the next response", async () => {
    const provider = mockProvider([
      '{"name":"a"}',
      '{"name":"a","value":3}',
    ]);
    const out = await runWithSchema({
      provider,
      messages: [{ role: "user", content: "go" }],
      schema: Schema,
    });
    expect(out.data).toEqual({ name: "a", value: 3 });
    expect(out.attempts).toBe(2);
  });

  it("retries on JSON parse failure", async () => {
    const provider = mockProvider([
      "not json at all",
      '{"name":"x","value":9}',
    ]);
    const out = await runWithSchema({
      provider,
      messages: [{ role: "user", content: "go" }],
      schema: Schema,
    });
    expect(out.data.value).toBe(9);
    expect(out.attempts).toBe(2);
  });

  it("throws SchemaValidationError after maxAttempts", async () => {
    const provider = mockProvider(["{}", "{}", "{}"]);
    await expect(
      runWithSchema({
        provider,
        messages: [{ role: "user", content: "go" }],
        schema: Schema,
      })
    ).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("accumulates token usage across attempts", async () => {
    const provider = mockProvider(["{}", '{"name":"a","value":4}']);
    const out = await runWithSchema({
      provider,
      messages: [{ role: "user", content: "go" }],
      schema: Schema,
    });
    expect(out.usage.totalTokens).toBe(30);
  });
});
