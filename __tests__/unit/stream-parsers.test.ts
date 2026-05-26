import { describe, it, expect } from "vitest";
import { iterateSSE, iterateNDJSON } from "../../src/lib/llm/stream-parsers";

function responseFrom(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const queue = chunks.map((c) => encoder.encode(c));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of queue) controller.enqueue(c);
      controller.close();
    },
  });
  return new Response(stream);
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of iter) out.push(v);
  return out;
}

describe("iterateSSE", () => {
  it("yields parsed JSON for each event", async () => {
    const res = responseFrom([
      'data: {"a":1}\n\n',
      'data: {"a":2}\n\n',
    ]);
    const frames = await collect(iterateSSE(res));
    expect(frames).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("skips the [DONE] sentinel", async () => {
    const res = responseFrom([
      'data: {"a":1}\n\n',
      "data: [DONE]\n\n",
    ]);
    expect(await collect(iterateSSE(res))).toEqual([{ a: 1 }]);
  });

  it("tolerates an event split across chunks", async () => {
    const res = responseFrom(['data: {"a"', ':5}\n\n']);
    expect(await collect(iterateSSE(res))).toEqual([{ a: 5 }]);
  });

  it("ignores malformed JSON payloads", async () => {
    const res = responseFrom(['data: not-json\n\n', 'data: {"ok":true}\n\n']);
    expect(await collect(iterateSSE(res))).toEqual([{ ok: true }]);
  });
});

describe("iterateNDJSON", () => {
  it("yields one object per line", async () => {
    const res = responseFrom(['{"a":1}\n{"a":2}\n']);
    expect(await collect(iterateNDJSON(res))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("flushes the trailing line without a final newline", async () => {
    const res = responseFrom(['{"a":1}\n{"a":2}']);
    expect(await collect(iterateNDJSON(res))).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("tolerates split chunks", async () => {
    const res = responseFrom(['{"a":', "1}\n{", '"a":2}\n']);
    expect(await collect(iterateNDJSON(res))).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
