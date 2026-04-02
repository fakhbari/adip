import { describe, test, expect } from "bun:test";

describe("Repository CRUD Operations", () => {
  const baseUrl = "http://localhost:3000";

  describe("POST /api/repositories", () => {
    test("should create a new repository with minimal info", async () => {
      const uniqueName = `test-service-${Date.now()}`;
      const response = await fetch(`${baseUrl}/api/repositories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uniqueName,
          description: "A test service for unit testing",
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.repository).toBeDefined();
      expect(data.repository.name).toBe(uniqueName);
      expect(data.repository.languages).toEqual([]);
    });

    test("should require repository name", async () => {
      const response = await fetch(`${baseUrl}/api/repositories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "Missing name field",
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    test("should auto-generate slug from name", async () => {
      const uniqueName = `My Test Service ${Date.now()}`;
      const response = await fetch(`${baseUrl}/api/repositories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uniqueName,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.repository.slug).toBe(uniqueName.toLowerCase().replace(/\s+/g, "-"));
    });
  });

  describe("DELETE /api/repositories", () => {
    test("should require repository id", async () => {
      const response = await fetch(`${baseUrl}/api/repositories`, {
        method: "DELETE",
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe("GET /api/repositories", () => {
    test("should return repositories with all doc type columns", async () => {
      const response = await fetch(`${baseUrl}/api/repositories`);
      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.repositories).toBeDefined();
      expect(Array.isArray(data.repositories)).toBe(true);

      if (data.repositories.length > 0) {
        const repo = data.repositories[0];
        expect(repo.docTypes).toBeDefined();
        expect(repo.docTypes.c4).toBeDefined();
        expect(repo.docTypes.adr).toBeDefined();
        expect(repo.docTypes.openapi).toBeDefined();
        expect(repo.docTypes.asyncapi).toBeDefined();
        expect(repo.docTypes.contextMap).toBeDefined();
        expect(repo.docTypes.dataCatalog).toBeDefined();
      }
    });

    test("should return valid doc status values", async () => {
      const response = await fetch(`${baseUrl}/api/repositories`);
      const data = await response.json();
      
      const validStatuses = ["complete", "partial", "missing"];
      data.repositories.forEach((repo: any) => {
        expect(validStatuses).toContain(repo.docStatus);
      });
    });

    test("should return languages as array", async () => {
      const response = await fetch(`${baseUrl}/api/repositories`);
      const data = await response.json();
      
      data.repositories.forEach((repo: any) => {
        expect(Array.isArray(repo.languages)).toBe(true);
      });
    });

    test("should not return project field", async () => {
      const response = await fetch(`${baseUrl}/api/repositories`);
      const data = await response.json();
      
      data.repositories.forEach((repo: any) => {
        expect(repo.project).toBeUndefined();
      });
    });
  });
});
