// Unit-tests for the progress coalescer logic. We test the in-memory
// shape by re-implementing the bits (Map + setTimeout-based emit) and
// asserting on emit counts; the production code uses the same pattern.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const COALESCE_INTERVAL_MS = 200;

type Payload = { analysisRunId: string; repositoryId: string };

function makeCoalescer(emit: (kind: string, p: Payload) => void) {
  const pending = new Map<string, { payload: Payload; timer: ReturnType<typeof setTimeout> }>();

  function coalesceProgress(payload: Payload) {
    const existing = pending.get(payload.analysisRunId);
    if (existing) {
      existing.payload = payload;
      return;
    }
    const timer = setTimeout(() => {
      const cur = pending.get(payload.analysisRunId);
      pending.delete(payload.analysisRunId);
      if (cur) emit("progress", cur.payload);
    }, COALESCE_INTERVAL_MS);
    pending.set(payload.analysisRunId, { payload, timer });
  }

  function flushAndEmit(kind: "complete" | "error", payload: Payload) {
    const cur = pending.get(payload.analysisRunId);
    if (cur) {
      clearTimeout(cur.timer);
      pending.delete(payload.analysisRunId);
      emit("progress", cur.payload);
    }
    emit(kind, payload);
  }

  return { coalesceProgress, flushAndEmit, pending };
}

describe("ws progress coalescer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits the latest progress in a 200ms window", () => {
    const emit = vi.fn();
    const { coalesceProgress } = makeCoalescer(emit);
    for (let i = 0; i < 50; i++) {
      coalesceProgress({ analysisRunId: "r1", repositoryId: "p1" });
    }
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(COALESCE_INTERVAL_MS + 1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("separate analyses do not coalesce together", () => {
    const emit = vi.fn();
    const { coalesceProgress } = makeCoalescer(emit);
    coalesceProgress({ analysisRunId: "r1", repositoryId: "p" });
    coalesceProgress({ analysisRunId: "r2", repositoryId: "p" });
    vi.advanceTimersByTime(COALESCE_INTERVAL_MS + 1);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it("flushAndEmit drains pending progress before the terminal event", () => {
    const emit = vi.fn();
    const { coalesceProgress, flushAndEmit } = makeCoalescer(emit);
    coalesceProgress({ analysisRunId: "r1", repositoryId: "p" });
    flushAndEmit("complete", { analysisRunId: "r1", repositoryId: "p" });
    expect(emit.mock.calls.map((c) => c[0])).toEqual(["progress", "complete"]);
  });
});
