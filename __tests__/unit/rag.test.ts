import { describe, it, expect } from "vitest";
import { chunkFile } from "../../src/lib/rag/chunker";
import { InMemoryRetriever } from "../../src/lib/rag/retriever";
import type { LLMProvider } from "../../src/lib/llm/provider";

describe("chunkFile", () => {
  it("yields one chunk for small files", () => {
    const chunks = [...chunkFile("a.txt", "hello world")];
    expect(chunks.length).toBe(1);
    expect(chunks[0].chunkIndex).toBe(0);
  });

  it("splits long files with overlap", () => {
    const content = "x".repeat(4000);
    const chunks = [...chunkFile("b.txt", content, { size: 1500, overlap: 100 })];
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    // Overlap: each chunk after the first starts 100 chars before the
    // previous end, so adjacent chunks share characters.
    expect(chunks[1].content.length).toBeLessThanOrEqual(1500);
  });

  it("produces stable contentHash per chunk", () => {
    const a = [...chunkFile("a.txt", "same content")];
    const b = [...chunkFile("a.txt", "same content")];
    expect(a[0].contentHash).toBe(b[0].contentHash);
  });
});

describe("InMemoryRetriever", () => {
  function fakeProvider(): LLMProvider {
    // Deterministic 3-d embedding: hash the input to three numbers.
    function embedOne(text: string): number[] {
      let h1 = 0;
      let h2 = 0;
      let h3 = 0;
      for (let i = 0; i < text.length; i++) {
        h1 = (h1 + text.charCodeAt(i)) % 100;
        h2 = (h2 + text.charCodeAt(i) * (i + 1)) % 100;
        h3 = (h3 + text.charCodeAt(i) ** 2) % 100;
      }
      return [h1, h2, h3];
    }
    return {
      kind: "fake",
      model: "fake-embed",
      async chat() {
        throw new Error("not used");
      },
      async embed(texts: string[]) {
        return { embeddings: texts.map(embedOne), usage: { totalTokens: texts.length } };
      },
    };
  }

  it("indexes chunks and returns the closest by cosine similarity", async () => {
    const provider = fakeProvider();
    const retriever = new InMemoryRetriever(provider);
    await retriever.index([
      { filePath: "auth.ts", chunkIndex: 0, content: "auth service login", contentHash: "h1" },
      { filePath: "billing.ts", chunkIndex: 0, content: "invoice line items", contentHash: "h2" },
      { filePath: "core.ts", chunkIndex: 0, content: "generic helpers", contentHash: "h3" },
    ]);
    const out = await retriever.search("auth service login", 1);
    expect(out[0].filePath).toBe("auth.ts");
  });
});
