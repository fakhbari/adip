import { describe, it, expect } from "vitest";
import { getTimeAgo, generateTrendData } from "../../src/lib/dashboard-utils";

describe("Dashboard Utilities", () => {
  describe("getTimeAgo", () => {
    it("should return seconds ago for recent times", () => {
      const now = new Date();
      const thirtySecondsAgo = new Date(now.getTime() - 30000);
      expect(getTimeAgo(thirtySecondsAgo)).toContain("sec ago");
    });

    it("should return minutes ago for times within an hour", () => {
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      expect(getTimeAgo(thirtyMinutesAgo)).toContain("min ago");
    });

    it("should return hours ago for times within a day", () => {
      const now = new Date();
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      expect(getTimeAgo(fiveHoursAgo)).toContain("hours ago");
    });

    it("should return days ago for older times", () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      expect(getTimeAgo(twoDaysAgo)).toContain("days ago");
    });
  });

  describe("generateTrendData", () => {
    it("should generate 4 weeks of data", () => {
      const data = generateTrendData();
      expect(data.length).toBe(4);
    });

    it("should have correct structure for each data point", () => {
      const data = generateTrendData();
      data.forEach((point) => {
        expect(point).toHaveProperty("date");
        expect(point).toHaveProperty("documents");
        expect(point).toHaveProperty("repositories");
        expect(typeof point.documents).toBe("number");
        expect(typeof point.repositories).toBe("number");
      });
    });

    it("should generate increasing trend", () => {
      const data = generateTrendData();
      for (let i = 1; i < data.length; i++) {
        expect(data[i].documents).toBeGreaterThanOrEqual(data[i - 1].documents);
        expect(data[i].repositories).toBeGreaterThanOrEqual(data[i - 1].repositories);
      }
    });
  });
});
