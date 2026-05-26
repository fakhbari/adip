import { describe, it, expect } from "vitest";
import { computeGaps } from "../../src/lib/external/gap-analysis";

describe("computeGaps", () => {
  it("flags identical rings as aligned", () => {
    const rows = computeGaps({
      org: [{ name: "PostgreSQL", quadrant: "platforms", ring: "adopt" }],
      tw: [{ name: "PostgreSQL", quadrant: "platforms", ring: "adopt" }],
    });
    expect(rows[0].gap).toBe("aligned");
  });

  it("flags org-still-using when TW says hold", () => {
    const rows = computeGaps({
      org: [{ name: "Java 8", quadrant: "languages-frameworks", ring: "adopt" }],
      tw: [{ name: "Java 8", quadrant: "languages-frameworks", ring: "hold" }],
    });
    expect(rows[0].gap).toBe("technical-debt");
  });

  it("flags behind when org ring < TW ring (assess vs adopt)", () => {
    const rows = computeGaps({
      org: [{ name: "Kotlin", quadrant: "languages-frameworks", ring: "assess" }],
      tw: [{ name: "Kotlin", quadrant: "languages-frameworks", ring: "adopt" }],
    });
    expect(rows[0].gap).toBe("behind");
  });

  it("flags org-ahead when org has it but TW does not", () => {
    const rows = computeGaps({
      org: [{ name: "InternalDSL", quadrant: "techniques", ring: "trial" }],
      tw: [],
    });
    expect(rows[0].gap).toBe("ahead");
  });

  it("emits opportunity rows for TW adopt/trial not in org", () => {
    const rows = computeGaps({
      org: [],
      tw: [
        { name: "Quarkus", quadrant: "languages-frameworks", ring: "trial" },
        { name: "Astro",   quadrant: "languages-frameworks", ring: "assess" }, // not opportunity
      ],
    });
    const oppNames = rows.filter((r) => r.gap === "opportunity").map((r) => r.name);
    expect(oppNames).toEqual(["Quarkus"]);
  });
});
