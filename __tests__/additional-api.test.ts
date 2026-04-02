import { describe, it, expect } from "bun:test";

describe("OpenAPI and Context Map API Endpoints", () => {
  const baseUrl = "http://localhost:3000";

  describe("OpenAPI API", () => {
    it("should return OpenAPI documents", async () => {
      const response = await fetch(`${baseUrl}/api/openapi`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty("documents");
      expect(data).toHaveProperty("repositories");
      expect(Array.isArray(data.documents)).toBe(true);
      expect(Array.isArray(data.repositories)).toBe(true);
    });

    it("should return OpenAPI documents with correct structure", async () => {
      const response = await fetch(`${baseUrl}/api/openapi`);
      const data = await response.json();
      
      if (data.documents.length > 0) {
        const doc = data.documents[0];
        expect(doc).toHaveProperty("id");
        expect(doc).toHaveProperty("repositoryId");
        expect(doc).toHaveProperty("repositoryName");
        expect(doc).toHaveProperty("title");
        expect(doc).toHaveProperty("version");
        expect(doc).toHaveProperty("endpointCount");
        expect(doc).toHaveProperty("schemaCount");
        expect(doc).toHaveProperty("content");
        expect(doc).toHaveProperty("status");
      }
    });

    it("should return valid OpenAPI YAML content", async () => {
      const response = await fetch(`${baseUrl}/api/openapi`);
      const data = await response.json();
      
      if (data.documents.length > 0) {
        const doc = data.documents[0];
        expect(doc.content).toContain("openapi:");
        expect(doc.content).toContain("info:");
        expect(doc.content).toContain("paths:");
      }
    });

    it("should return repositories with hasOpenAPI flag", async () => {
      const response = await fetch(`${baseUrl}/api/openapi`);
      const data = await response.json();
      
      data.repositories.forEach((repo: any) => {
        expect(repo).toHaveProperty("id");
        expect(repo).toHaveProperty("name");
        expect(repo).toHaveProperty("hasOpenAPI");
        expect(typeof repo.hasOpenAPI).toBe("boolean");
      });
    });
  });

  describe("Context Map API", () => {
    it("should return context map documents", async () => {
      const response = await fetch(`${baseUrl}/api/context-map`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty("documents");
      expect(data).toHaveProperty("repositories");
      expect(Array.isArray(data.documents)).toBe(true);
      expect(Array.isArray(data.repositories)).toBe(true);
    });

    it("should return context map documents with correct structure", async () => {
      const response = await fetch(`${baseUrl}/api/context-map`);
      const data = await response.json();
      
      if (data.documents.length > 0) {
        const doc = data.documents[0];
        expect(doc).toHaveProperty("id");
        expect(doc).toHaveProperty("repositoryId");
        expect(doc).toHaveProperty("repositoryName");
        expect(doc).toHaveProperty("content");
        expect(doc).toHaveProperty("contexts");
        expect(doc).toHaveProperty("status");
      }
    });

    it("should return bounded contexts with relationships", async () => {
      const response = await fetch(`${baseUrl}/api/context-map`);
      const data = await response.json();
      
      if (data.documents.length > 0) {
        const doc = data.documents[0];
        if (doc.contexts.length > 0) {
          const context = doc.contexts[0];
          expect(context).toHaveProperty("id");
          expect(context).toHaveProperty("name");
          expect(context).toHaveProperty("relationships");
          expect(Array.isArray(context.relationships)).toBe(true);
        }
      }
    });

    it("should return repositories with hasContextMap flag", async () => {
      const response = await fetch(`${baseUrl}/api/context-map`);
      const data = await response.json();
      
      data.repositories.forEach((repo: any) => {
        expect(repo).toHaveProperty("id");
        expect(repo).toHaveProperty("name");
        expect(repo).toHaveProperty("hasContextMap");
        expect(typeof repo.hasContextMap).toBe("boolean");
      });
    });

    it("should include Mermaid diagram in content", async () => {
      const response = await fetch(`${baseUrl}/api/context-map`);
      const data = await response.json();
      
      if (data.documents.length > 0) {
        const doc = data.documents[0];
        expect(doc.content).toContain("mermaid");
      }
    });
  });
});
