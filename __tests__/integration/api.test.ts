import { describe, it, expect, beforeAll } from "vitest";

describe("API Endpoints", () => {
  const baseUrl = "http://localhost:3000";

  describe("Dashboard Stats API", () => {
    it("should return dashboard statistics", async () => {
      const response = await fetch(`${baseUrl}/api/dashboard/stats`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty("totalRepositories");
      expect(data).toHaveProperty("documentedRepos");
      expect(data).toHaveProperty("needsAttention");
      expect(data).toHaveProperty("totalDocuments");
      expect(data).toHaveProperty("lastRunStatus");
      expect(data).toHaveProperty("lastRunTime");
      expect(data).toHaveProperty("coverageByType");
      expect(data).toHaveProperty("recentActivity");
      expect(data).toHaveProperty("technologyDistribution");
      expect(data).toHaveProperty("documentationTrend");
    });

    it("should return valid coverage data structure", async () => {
      const response = await fetch(`${baseUrl}/api/dashboard/stats`);
      const data = await response.json();
      
      expect(Array.isArray(data.coverageByType)).toBe(true);
      data.coverageByType.forEach((item: any) => {
        expect(item).toHaveProperty("type");
        expect(item).toHaveProperty("coverage");
        expect(item).toHaveProperty("count");
        expect(typeof item.coverage).toBe("number");
        expect(item.coverage).toBeGreaterThanOrEqual(0);
        expect(item.coverage).toBeLessThanOrEqual(100);
      });
    });

    it("should return valid technology distribution", async () => {
      const response = await fetch(`${baseUrl}/api/dashboard/stats`);
      const data = await response.json();
      
      expect(Array.isArray(data.technologyDistribution)).toBe(true);
      data.technologyDistribution.forEach((item: any) => {
        expect(item).toHaveProperty("name");
        expect(item).toHaveProperty("value");
        expect(item).toHaveProperty("color");
        expect(typeof item.value).toBe("number");
        expect(item.value).toBeGreaterThan(0);
      });
    });
  });

  describe("Repositories API", () => {
    it("should return list of repositories", async () => {
      const response = await fetch(`${baseUrl}/api/repositories`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty("repositories");
      expect(Array.isArray(data.repositories)).toBe(true);
    });

    it("should return repositories with correct structure", async () => {
      const response = await fetch(`${baseUrl}/api/repositories`);
      const data = await response.json();
      
      if (data.repositories.length > 0) {
        const repo = data.repositories[0];
        expect(repo).toHaveProperty("id");
        expect(repo).toHaveProperty("name");
        expect(repo).toHaveProperty("slug");
        expect(repo).toHaveProperty("languages");
        expect(repo).toHaveProperty("docStatus");
        expect(repo).toHaveProperty("docTypes");
        expect(Array.isArray(repo.languages)).toBe(true);
        expect(["complete", "partial", "missing"]).toContain(repo.docStatus);
      }
    });

    it("should filter repositories by search", async () => {
      const response = await fetch(`${baseUrl}/api/repositories?search=auth`);
      const data = await response.json();
      
      // If repositories are returned, they should match the search
      if (data.repositories.length > 0) {
        const hasAuthRepo = data.repositories.some((repo: any) => 
          repo.name.toLowerCase().includes("auth")
        );
        expect(hasAuthRepo).toBe(true);
      }
    });
  });

  describe("Tech Radar API", () => {
    it("should return radar data", async () => {
      const response = await fetch(`${baseUrl}/api/radar`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty("technologies");
      expect(data).toHaveProperty("gapAnalysis");
      expect(data).toHaveProperty("stats");
    });

    it("should return valid technology items", async () => {
      const response = await fetch(`${baseUrl}/api/radar`);
      const data = await response.json();
      
      expect(Array.isArray(data.technologies)).toBe(true);
      data.technologies.forEach((tech: any) => {
        expect(tech).toHaveProperty("id");
        expect(tech).toHaveProperty("name");
        expect(tech).toHaveProperty("ring");
        expect(tech).toHaveProperty("quadrant");
        expect(["adopt", "trial", "assess", "hold"]).toContain(tech.ring);
      });
    });

    it("should return valid stats", async () => {
      const response = await fetch(`${baseUrl}/api/radar`);
      const data = await response.json();
      
      expect(data.stats).toHaveProperty("total");
      expect(data.stats).toHaveProperty("adopt");
      expect(data.stats).toHaveProperty("trial");
      expect(data.stats).toHaveProperty("assess");
      expect(data.stats).toHaveProperty("hold");
      
      const { total, adopt, trial, assess, hold } = data.stats;
      expect(total).toBeGreaterThanOrEqual(adopt + trial + assess + hold);
    });
  });

  describe("ADR API", () => {
    it("should return ADR list", async () => {
      const response = await fetch(`${baseUrl}/api/adr`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty("adrs");
      expect(data).toHaveProperty("stats");
      expect(data).toHaveProperty("repositories");
    });

    it("should return ADRs with correct structure", async () => {
      const response = await fetch(`${baseUrl}/api/adr`);
      const data = await response.json();
      
      if (data.adrs.length > 0) {
        const adr = data.adrs[0];
        expect(adr).toHaveProperty("id");
        expect(adr).toHaveProperty("number");
        expect(adr).toHaveProperty("title");
        expect(adr).toHaveProperty("status");
        expect(adr).toHaveProperty("repositoryName");
        expect(adr).toHaveProperty("context");
        expect(adr).toHaveProperty("decision");
      }
    });
  });

  describe("Settings API", () => {
    it("should return settings", async () => {
      const response = await fetch(`${baseUrl}/api/settings`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty("connections");
      expect(data).toHaveProperty("schedules");
      expect(data).toHaveProperty("settings");
    });

    it("should return valid settings structure", async () => {
      const response = await fetch(`${baseUrl}/api/settings`);
      const data = await response.json();
      
      expect(data.settings).toHaveProperty("aiProvider");
      expect(data.settings).toHaveProperty("apiKey");
      expect(data.settings).toHaveProperty("notifications");
      
      expect(data.settings.notifications).toHaveProperty("email");
      expect(data.settings.notifications).toHaveProperty("slack");
      expect(data.settings.notifications).toHaveProperty("teams");
    });
  });

  describe("C4 API", () => {
    it("should return C4 documents", async () => {
      const response = await fetch(`${baseUrl}/api/c4`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty("documents");
      expect(data).toHaveProperty("repositories");
    });

    it("should return repositories with hasC4 flag", async () => {
      const response = await fetch(`${baseUrl}/api/c4`);
      const data = await response.json();
      
      data.repositories.forEach((repo: any) => {
        expect(repo).toHaveProperty("id");
        expect(repo).toHaveProperty("name");
        expect(repo).toHaveProperty("hasC4");
        expect(typeof repo.hasC4).toBe("boolean");
      });
    });
  });
});
