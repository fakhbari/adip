// ThoughtWorks Radar fetcher with offline fallback.
//
// Phase 3.4. ThoughtWorks publishes their Radar as a static dataset
// at radar.thoughtworks.com. We try a live fetch first (24h cache);
// when offline (or when ADIP_THOUGHTWORKS_OFFLINE is set), we fall
// back to the vendored snapshot under vendor/thoughtworks-radar/.
//
// The snapshot is a hand-curated subset of recent volumes (~40
// entries) sufficient for gap analysis. Replace
// vendor/thoughtworks-radar/snapshot.json with a fresher version any
// time the live fetch path is unreliable.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchWithRetry } from "@/lib/vcs/fetch-with-retry";
import { logger } from "@/lib/logger";

const log = logger("external.thoughtworks");

export type ThoughtWorksEntry = {
  name: string;
  quadrant: "techniques" | "tools" | "platforms" | "languages-frameworks";
  ring: "adopt" | "trial" | "assess" | "hold";
};

export type ThoughtWorksSnapshot = {
  _meta?: { source?: string; volume?: string; publishedAt?: string; url?: string };
  entries: ThoughtWorksEntry[];
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cache: { data: ThoughtWorksSnapshot; loadedAt: number } | null = null;

const VENDORED_PATH = path.resolve(process.cwd(), "vendor/thoughtworks-radar/snapshot.json");
const LIVE_URL =
  process.env.ADIP_THOUGHTWORKS_URL ??
  "https://raw.githubusercontent.com/thoughtworks/build-your-own-radar/master/src/data/radar-entries.json";

export async function getThoughtWorksRadar(opts?: { force?: boolean }): Promise<ThoughtWorksSnapshot> {
  const now = Date.now();
  if (!opts?.force && cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  if (!process.env.ADIP_THOUGHTWORKS_OFFLINE) {
    try {
      const res = await fetchWithRetry(LIVE_URL, {}, { maxAttempts: 2 });
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text) as ThoughtWorksSnapshot | ThoughtWorksEntry[];
        const normalised: ThoughtWorksSnapshot = Array.isArray(data) ? { entries: data } : data;
        cache = { data: normalised, loadedAt: now };
        return normalised;
      }
      log.warn({ status: res.status }, "TW live fetch non-OK; falling back to snapshot");
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "TW live fetch failed; falling back to snapshot"
      );
    }
  }

  // Vendored snapshot.
  const text = await readFile(VENDORED_PATH, "utf8");
  const data = JSON.parse(text) as ThoughtWorksSnapshot;
  cache = { data, loadedAt: now };
  return data;
}

/** Test-only — reset the in-process cache between cases. */
export function __resetCacheForTests(): void {
  cache = null;
}
