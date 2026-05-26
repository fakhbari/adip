// Deterministic gap analysis: org tech list vs ThoughtWorks Radar.
//
// Phase 3.4. The LLM-flavoured "write recommendations" step layers on
// top of this deterministic core in the dashboard/api/radar route.
// Keeping the join pure lets us unit-test it offline.

import type { ThoughtWorksEntry } from "./thoughtworks";

export type GapStatus = "aligned" | "behind" | "ahead" | "missing" | "technical-debt" | "opportunity";

export type GapRow = {
  name: string;
  orgRing?: "adopt" | "trial" | "assess" | "hold";
  twRing?: "adopt" | "trial" | "assess" | "hold";
  quadrant: ThoughtWorksEntry["quadrant"];
  gap: GapStatus;
};

const RING_ORDER = { adopt: 3, trial: 2, assess: 1, hold: 0 } as const;

export function computeGaps(args: {
  org: { name: string; quadrant: ThoughtWorksEntry["quadrant"]; ring: "adopt" | "trial" | "assess" | "hold" }[];
  tw: ThoughtWorksEntry[];
}): GapRow[] {
  const byName = new Map(args.tw.map((e) => [e.name.toLowerCase(), e]));
  const rows: GapRow[] = [];

  for (const orgEntry of args.org) {
    const tw = byName.get(orgEntry.name.toLowerCase());
    if (!tw) {
      rows.push({
        name: orgEntry.name,
        orgRing: orgEntry.ring,
        twRing: undefined,
        quadrant: orgEntry.quadrant,
        gap: "ahead", // org uses something TW does not cover (or TW snapshot is stale)
      });
      continue;
    }
    if (orgEntry.ring === tw.ring) {
      rows.push({ name: orgEntry.name, orgRing: orgEntry.ring, twRing: tw.ring, quadrant: tw.quadrant, gap: "aligned" });
    } else if (tw.ring === "hold" && orgEntry.ring !== "hold") {
      rows.push({ name: orgEntry.name, orgRing: orgEntry.ring, twRing: tw.ring, quadrant: tw.quadrant, gap: "technical-debt" });
    } else if (RING_ORDER[orgEntry.ring] < RING_ORDER[tw.ring]) {
      rows.push({ name: orgEntry.name, orgRing: orgEntry.ring, twRing: tw.ring, quadrant: tw.quadrant, gap: "behind" });
    } else {
      rows.push({ name: orgEntry.name, orgRing: orgEntry.ring, twRing: tw.ring, quadrant: tw.quadrant, gap: "ahead" });
    }
  }

  // TW entries the org doesn't use yet — opportunity (Adopt/Trial only).
  const orgNames = new Set(args.org.map((o) => o.name.toLowerCase()));
  for (const tw of args.tw) {
    if (orgNames.has(tw.name.toLowerCase())) continue;
    if (tw.ring === "adopt" || tw.ring === "trial") {
      rows.push({ name: tw.name, twRing: tw.ring, quadrant: tw.quadrant, gap: "opportunity" });
    }
  }

  return rows;
}
