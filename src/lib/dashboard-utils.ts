export function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  
  if (seconds < 60) return `${seconds} sec ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

export function generateTrendData() {
  const data = [];
  for (let i = 3; i >= 0; i--) {
    data.push({
      date: `Week ${4 - i}`,
      documents: 120 + (3 - i) * 22,
      repositories: 25 + (3 - i) * 7,
    });
  }
  return data;
}

export function getDefaultCoverage() {
  return [
    { type: "C4 Docs", coverage: 76, count: 36 },
    { type: "ADRs", coverage: 58, count: 27 },
    { type: "Context Map", coverage: 40, count: 19 },
    { type: "OpenAPI", coverage: 89, count: 42 },
    { type: "AsyncAPI", coverage: 42, count: 20 },
    { type: "Data Catalog", coverage: 31, count: 15 },
  ];
}

export function getDefaultActivity() {
  return [
    { id: "1", action: "ADR Generated", entity: "auth-service", time: "5 min ago", status: "success" as const },
    { id: "2", action: "C4 Updated", entity: "payment-svc", time: "15 min ago", status: "success" as const },
    { id: "3", action: "API Docs", entity: "notification", time: "1 hour ago", status: "warning" as const },
    { id: "4", action: "Analysis Failed", entity: "report-gen", time: "2 hours ago", status: "error" as const },
    { id: "5", action: "Tech Radar", entity: "organization", time: "3 hours ago", status: "success" as const },
  ];
}

export function getDefaultTechDist() {
  return [
    { name: "TypeScript", value: 18, color: "#3178c6" },
    { name: "Python", value: 12, color: "#3572A5" },
    { name: "Java", value: 8, color: "#b07219" },
    { name: "Go", value: 5, color: "#00ADD8" },
    { name: "Others", value: 4, color: "#6e7681" },
  ];
}

export function getDefaultRepositories() {
  return [
    {
      id: "1",
      name: "auth-service",
      slug: "auth-service",
      description: "Authentication and authorization service",
      project: "Platform",
      language: "TypeScript",
      framework: "NestJS",
      lastAnalyzedAt: new Date(),
      docStatus: "complete" as const,
      docTypes: { c4: true, adr: true, openapi: true, asyncapi: true, contextMap: true, dataCatalog: true },
      documentCount: 6,
      adrCount: 3,
    },
    {
      id: "2",
      name: "payment-svc",
      slug: "payment-svc",
      description: "Payment processing service",
      project: "Fintech",
      language: "Java",
      framework: "Spring Boot",
      lastAnalyzedAt: new Date(),
      docStatus: "partial" as const,
      docTypes: { c4: true, adr: false, openapi: true, asyncapi: false, contextMap: false, dataCatalog: false },
      documentCount: 3,
      adrCount: 1,
    },
    {
      id: "3",
      name: "notification",
      slug: "notification",
      description: "Notification delivery service",
      project: "Platform",
      language: "Python",
      framework: "FastAPI",
      lastAnalyzedAt: new Date(Date.now() - 86400000),
      docStatus: "missing" as const,
      docTypes: { c4: false, adr: false, openapi: true, asyncapi: false, contextMap: false, dataCatalog: false },
      documentCount: 1,
      adrCount: 0,
    },
    {
      id: "4",
      name: "report-gen",
      slug: "report-gen",
      description: "Report generation service",
      project: "BI",
      language: "Go",
      framework: "Gin",
      lastAnalyzedAt: new Date(),
      docStatus: "complete" as const,
      docTypes: { c4: true, adr: true, openapi: true, asyncapi: false, contextMap: true, dataCatalog: false },
      documentCount: 4,
      adrCount: 2,
    },
    {
      id: "5",
      name: "user-management",
      slug: "user-management",
      description: "User management and profile service",
      project: "Core",
      language: "TypeScript",
      framework: "Next.js",
      lastAnalyzedAt: new Date(Date.now() - 172800000),
      docStatus: "partial" as const,
      docTypes: { c4: true, adr: true, openapi: false, asyncapi: false, contextMap: false, dataCatalog: true },
      documentCount: 3,
      adrCount: 2,
    },
  ];
}
