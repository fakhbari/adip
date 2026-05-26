// Chunker — turns repository file contents into retrieval chunks.
//
// Phase 2.3 minimum: a window-based chunker (no AST). The plan calls
// for tree-sitter AST-aware chunking; vendoring the wasm bundle is
// deferred to a Phase 2.3b follow-up. The window chunker is good
// enough for retrieval recall on most codebases.
//
// Default chunk size: ~1500 characters (~375 tokens at 4 chars/token).
// Overlap: 100 chars. The overlap stops important boundaries from
// falling between two chunks.

import { createHash } from "node:crypto";

export type Chunk = {
  filePath: string;
  chunkIndex: number;
  content: string;
  /** Stable hash of the content. Dedupes between snapshots. */
  contentHash: string;
};

export type ChunkerOptions = {
  /** Target chunk size in characters. */
  size?: number;
  /** Overlap in characters between adjacent chunks. */
  overlap?: number;
};

const DEFAULT_SIZE = 1500;
const DEFAULT_OVERLAP = 100;

export function* chunkFile(
  filePath: string,
  content: string,
  opts: ChunkerOptions = {}
): IterableIterator<Chunk> {
  const size = opts.size ?? DEFAULT_SIZE;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;
  if (content.length === 0) return;
  if (content.length <= size) {
    yield {
      filePath,
      chunkIndex: 0,
      content,
      contentHash: createHash("sha1").update(content).digest("hex"),
    };
    return;
  }
  let start = 0;
  let chunkIndex = 0;
  while (start < content.length) {
    const end = Math.min(start + size, content.length);
    const piece = content.slice(start, end);
    yield {
      filePath,
      chunkIndex,
      content: piece,
      contentHash: createHash("sha1").update(piece).digest("hex"),
    };
    chunkIndex++;
    if (end === content.length) break;
    start = end - overlap;
  }
}

/** Convenience: chunk every file in a Map. */
export function* chunkAll(files: Map<string, string>, opts?: ChunkerOptions): IterableIterator<Chunk> {
  for (const [path, content] of files) {
    yield* chunkFile(path, content, opts);
  }
}
