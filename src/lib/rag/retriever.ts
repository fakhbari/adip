// In-memory retriever. Phase 2.3 minimum.
//
// Embeds the chunks once with the configured LLM provider, holds the
// vectors in process memory for the duration of an analysis, and
// answers `search(query, k)` via cosine similarity. Persistent pgvector
// storage and cross-run reuse is a Phase 2.3b follow-up that requires
// either a Prisma migration with `Unsupported("vector(1024)")` or a
// raw-SQL repository layer; this in-memory cut unblocks Phase 2.5
// agents that want RAG context today.

import type { LLMProvider } from "@/lib/llm";
import type { Chunk } from "./chunker";

export type Retrieved = Chunk & { score: number };

export class InMemoryRetriever {
  private vectors: { chunk: Chunk; embedding: number[] }[] = [];
  private queryEmbedCache = new Map<string, number[]>();

  constructor(private readonly provider: LLMProvider) {}

  async index(chunks: Chunk[], batchSize = 32): Promise<void> {
    if (!this.provider.embed) {
      throw new Error(`LLMProvider ${this.provider.kind} does not implement embed()`);
    }
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const result = await this.provider.embed(batch.map((c) => c.content));
      for (let j = 0; j < batch.length; j++) {
        this.vectors.push({ chunk: batch[j], embedding: result.embeddings[j] ?? [] });
      }
    }
  }

  async search(query: string, k = 5): Promise<Retrieved[]> {
    if (!this.provider.embed) {
      throw new Error(`LLMProvider ${this.provider.kind} does not implement embed()`);
    }
    let qVec = this.queryEmbedCache.get(query);
    if (!qVec) {
      const result = await this.provider.embed([query]);
      qVec = result.embeddings[0] ?? [];
      this.queryEmbedCache.set(query, qVec);
    }

    return this.vectors
      .map(({ chunk, embedding }) => ({ ...chunk, score: cosine(qVec!, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  size(): number {
    return this.vectors.length;
  }
}

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}
