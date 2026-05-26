// Bounded-memory file store used by the orchestrator while an analysis
// runs. Phase 1.3 (Completion Plan).
//
// Two knobs:
//   - `maxBytes` — total UTF-8 bytes held in memory. Files added past
//     the cap are rejected (the caller decides whether to skip the
//     file or stream it to disk; current code skips).
//   - `maxFileBytes` — per-file cap. Files larger than this never enter
//     the cache at all. Useful for huge generated artefacts (minified
//     JS bundles, lockfile blobs) that would otherwise dominate.
//
// Replaces the previous `Map<string, string>` that grew unbounded.
// Agents still call `.get(path)` synchronously — the lazy fetch design
// from Phase 1.3's full scope is deferred (each agent would need to
// become async-aware throughout).

export type RepoFileCacheOptions = {
  /** Total UTF-8 byte budget for the cache. Default 256 MB. */
  maxBytes?: number;
  /** Per-file byte cap. Default 1 MB. */
  maxFileBytes?: number;
};

export class RepoFileCache {
  private store = new Map<string, string>();
  private byteCounts = new Map<string, number>();
  private currentBytes = 0;
  private readonly maxBytes: number;
  private readonly maxFileBytes: number;
  private rejected = 0;

  constructor(opts: RepoFileCacheOptions = {}) {
    this.maxBytes = opts.maxBytes ?? 256 * 1024 * 1024;
    this.maxFileBytes = opts.maxFileBytes ?? 1 * 1024 * 1024;
  }

  /**
   * Add a file to the cache. Returns false when the file was rejected
   * (over the per-file cap or total budget). Caller can decide what to
   * do — current orchestrator simply skips the file.
   */
  set(path: string, content: string): boolean {
    // Cheap upper-bound: UTF-16 length in JS strings × 2 ≥ UTF-8 bytes.
    // Using Buffer.byteLength is more accurate but every fetched file
    // already paid the encoding cost; this is the hot path.
    const byteSize = Buffer.byteLength(content, "utf8");

    if (byteSize > this.maxFileBytes) {
      this.rejected++;
      return false;
    }
    if (this.currentBytes + byteSize > this.maxBytes) {
      this.rejected++;
      return false;
    }

    // Replace path → adjust accounting.
    const previousSize = this.byteCounts.get(path) ?? 0;
    this.store.set(path, content);
    this.byteCounts.set(path, byteSize);
    this.currentBytes += byteSize - previousSize;
    return true;
  }

  get(path: string): string | undefined {
    return this.store.get(path);
  }

  has(path: string): boolean {
    return this.store.has(path);
  }

  paths(): IterableIterator<string> {
    return this.store.keys();
  }

  entries(): IterableIterator<[string, string]> {
    return this.store.entries();
  }

  size(): number {
    return this.store.size;
  }

  bytes(): number {
    return this.currentBytes;
  }

  rejectedCount(): number {
    return this.rejected;
  }

  /**
   * Backward-compatible bridge — produces a `Map<string, string>` from
   * the current contents. Used while we still pass the old shape down
   * through AnalysisContext.fileContents.
   */
  toMap(): Map<string, string> {
    return new Map(this.store);
  }
}
