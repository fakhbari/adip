// C4 Agent - Extracts C4 Architecture Model from Codebase

import { BaseAgent, createAgentConfig } from "./base-agent";
import { 
  AgentResult, 
  AnalysisContext, 
  C4Result,
  C4Level1,
  C4Level2,
  C4System,
  C4Person,
  C4Container,
  C4Relationship,
} from "./types";
import { FILE_PATTERNS } from "@/lib/vcs";

// Container types detection patterns
const CONTAINER_PATTERNS = {
  webApp: [
    /pages?\//i,
    /app?\//i,
    /src\/app\//i,
    /src\/pages\//i,
    /components?\//i,
    /\.tsx?$/i,
  ],
  api: [
    /api?\//i,
    /routes?\//i,
    /controllers?\//i,
    /handlers?\//i,
    /endpoints?\//i,
    /middleware?\//i,
  ],
  service: [
    /services?\//i,
    /workers?\//i,
    /jobs?\//i,
    /processors?\//i,
    /queues?\//i,
  ],
  database: [
    /models?\//i,
    /entities?\//i,
    /schema?\//i,
    /migrations?\//i,
    /prisma?\//i,
    /db?\//i,
  ],
  cli: [
    /cli?\//i,
    /commands?\//i,
    /bin?\//i,
  ],
};

export class C4Agent extends BaseAgent {
  constructor() {
    super(createAgentConfig("c4"));
  }

  async analyze(context: AnalysisContext): Promise<AgentResult> {
    const startTime = Date.now();

    this.updateProgress(5, "Analyzing codebase structure...");

    // Analyze file structure
    const fileStructure = this.analyzeFileStructure(context);
    
    this.updateProgress(25, "Detecting system boundaries...");

    // Detect system context (Level 1)
    const level1 = await this.detectLevel1(context, fileStructure);
    
    this.updateProgress(50, "Identifying containers...");

    // Detect containers (Level 2)
    const level2 = await this.detectLevel2(context, fileStructure);
    
    this.updateProgress(80, "Building C4 model...");

    const result: C4Result = {
      level1,
      level2,
      confidence: this.calculateConfidence(fileStructure),
    };

    this.filesAnalyzed = fileStructure.totalFiles;

    this.updateProgress(100, "C4 model extraction complete");

    return {
      agentType: "c4",
      status: "success",
      data: result,
      duration: Date.now() - startTime,
      filesAnalyzed: this.filesAnalyzed,
    };
  }

  // Analyze file structure
  private analyzeFileStructure(context: AnalysisContext): {
    directories: Map<string, number>;
    totalFiles: number;
    fileTypes: Map<string, number>;
    hasFrontend: boolean;
    hasBackend: boolean;
    hasDatabase: boolean;
    hasTests: boolean;
  } {
    const directories = new Map<string, number>();
    const fileTypes = new Map<string, number>();
    let totalFiles = 0;

    for (const path of context.fileContents.keys()) {
      totalFiles++;
      
      // Track directories
      const parts = path.split("/");
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join("/");
        directories.set(dir, (directories.get(dir) || 0) + 1);
      }

      // Track file types
      const ext = path.split(".").pop() || "unknown";
      fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
    }

    // Detect architecture type
    const dirList = Array.from(directories.keys()).map(d => d.toLowerCase());
    const hasFrontend = dirList.some(d => 
      CONTAINER_PATTERNS.webApp.some(p => p.test(d))
    ) || fileTypes.has("tsx") || fileTypes.has("jsx") || fileTypes.has("vue");
    
    const hasBackend = dirList.some(d => 
      CONTAINER_PATTERNS.api.some(p => p.test(d))
    ) || fileTypes.has("py") || fileTypes.has("java") || fileTypes.has("go");
    
    const hasDatabase = dirList.some(d => 
      CONTAINER_PATTERNS.database.some(p => p.test(d))
    ) || context.fileContents.has("prisma/schema.prisma") || 
       context.fileContents.has("migrations/") ||
       Array.from(context.fileContents.keys()).some(p => p.includes("model") || p.includes("entity"));
    
    const hasTests = dirList.some(d => 
      d.includes("test") || d.includes("spec") || d.includes("__tests__")
    );

    return {
      directories,
      totalFiles,
      fileTypes,
      hasFrontend,
      hasBackend,
      hasDatabase,
      hasTests,
    };
  }

  // Detect Level 1 - System Context
  private async detectLevel1(
    context: AnalysisContext,
    structure: ReturnType<typeof this.analyzeFileStructure>
  ): Promise<C4Level1> {
    const systemName = context.repository.name;
    const description = context.repository.description || 
      `Software system: ${systemName}`;

    // Detect the main system
    const system: C4System = {
      name: systemName,
      description,
      type: "internal",
    };

    // Detect persons (users)
    const persons: C4Person[] = this.detectPersons(context, structure);

    // Detect external systems
    const externalSystems: C4System[] = this.detectExternalSystems(context);

    // Build relationships
    const relationships: C4Relationship[] = this.detectLevel1Relationships(
      system,
      persons,
      externalSystems
    );

    return {
      system,
      persons,
      externalSystems,
      relationships,
    };
  }

  // Detect persons (users/actors)
  private detectPersons(
    context: AnalysisContext,
    structure: ReturnType<typeof this.analyzeFileStructure>
  ): C4Person[] {
    const persons: C4Person[] = [];
    const content = Array.from(context.fileContents.values()).join("\n").toLowerCase();

    // Detect based on authentication patterns
    if (content.includes("auth") || content.includes("login") || content.includes("user")) {
      persons.push({
        name: "User",
        description: "End user who interacts with the system",
        type: "user",
      });
    }

    // Detect admin user
    if (content.includes("admin") || content.includes("administrator")) {
      persons.push({
        name: "Administrator",
        description: "System administrator with elevated privileges",
        type: "admin",
      });
    }

    // Detect developer
    if (content.includes("api") || structure.hasBackend) {
      persons.push({
        name: "Developer",
        description: "Developer consuming the API",
        type: "developer",
      });
    }

    // Default user if none detected
    if (persons.length === 0) {
      persons.push({
        name: "User",
        description: "End user of the system",
        type: "user",
      });
    }

    return persons;
  }

  // Detect external systems
  private detectExternalSystems(context: AnalysisContext): C4System[] {
    const systems: C4System[] = [];
    const content = Array.from(context.fileContents.values()).join("\n").toLowerCase();

    // Check for common external services
    const externalPatterns = [
      { name: "AWS", patterns: ["aws-sdk", "@aws-sdk", "amazonaws"] },
      { name: "Azure", patterns: ["@azure", "azure-sdk"] },
      { name: "Google Cloud", patterns: ["@google-cloud", "googleapis"] },
      { name: "Stripe", patterns: ["stripe"] },
      { name: "PayPal", patterns: ["paypal"] },
      { name: "Twilio", patterns: ["twilio"] },
      { name: "SendGrid", patterns: ["@sendgrid", "sendgrid"] },
      { name: "Auth0", patterns: ["auth0"] },
      { name: "Firebase", patterns: ["firebase", "@firebase"] },
      { name: "Sentry", patterns: ["@sentry", "sentry"] },
      { name: "Datadog", patterns: ["datadog", "dd-trace"] },
      { name: "GitHub API", patterns: ["@octokit", "github api"] },
      { name: "GitLab API", patterns: ["gitlab api"] },
      { name: "Slack", patterns: ["@slack", "slack api"] },
    ];

    for (const { name, patterns } of externalPatterns) {
      if (patterns.some(p => content.includes(p))) {
        systems.push({
          name,
          description: `External ${name} service`,
          type: "external",
        });
      }
    }

    return systems;
  }

  // Detect Level 1 relationships
  private detectLevel1Relationships(
    system: C4System,
    persons: C4Person[],
    externalSystems: C4System[]
  ): C4Relationship[] {
    const relationships: C4Relationship[] = [];

    // Users interact with the system
    for (const person of persons) {
      relationships.push({
        source: person.name,
        target: system.name,
        description: person.type === "developer" 
          ? "Consumes API from" 
          : "Interacts with",
        technology: person.type === "developer" ? "HTTP/REST" : "Web Browser",
      });
    }

    // System interacts with external systems
    for (const external of externalSystems) {
      relationships.push({
        source: system.name,
        target: external.name,
        description: "Integrates with",
        technology: "API/SDK",
      });
    }

    return relationships;
  }

  // Detect Level 2 - Containers
  private async detectLevel2(
    context: AnalysisContext,
    structure: ReturnType<typeof this.analyzeFileStructure>
  ): Promise<C4Level2> {
    const containers: C4Container[] = [];
    const relationships: C4Relationship[] = [];
    const techStack = this.detectTechStack(context);

    // Detect Web Application container
    if (structure.hasFrontend) {
      containers.push({
        name: "Web Application",
        description: "Frontend web application providing the user interface",
        type: "web-app",
        technology: this.getFrontendTech(techStack),
      });
    }

    // Detect API container
    if (structure.hasBackend) {
      const apiContainer: C4Container = {
        name: "API Server",
        description: "Backend API server handling business logic",
        type: "api",
        technology: this.getBackendTech(techStack),
      };
      containers.push(apiContainer);

      // Relationship: Web App -> API
      if (structure.hasFrontend) {
        relationships.push({
          source: "Web Application",
          target: "API Server",
          description: "Makes API calls to",
          technology: "HTTP/JSON",
        });
      }
    }

    // Detect Database container
    if (structure.hasDatabase) {
      containers.push({
        name: "Database",
        description: "Primary data store for the application",
        type: "database",
        technology: this.getDatabaseTech(context),
      });

      // Relationship: API -> Database
      if (structure.hasBackend) {
        relationships.push({
          source: "API Server",
          target: "Database",
          description: "Reads from and writes to",
          technology: "SQL/ORM",
        });
      }
    }

    // Detect Cache container
    const content = Array.from(context.fileContents.keys()).join(" ");
    if (content.includes("redis") || content.includes("cache") || content.includes("ioredis")) {
      containers.push({
        name: "Cache",
        description: "Distributed cache for session and data caching",
        type: "cache",
        technology: "Redis",
      });

      if (structure.hasBackend) {
        relationships.push({
          source: "API Server",
          target: "Cache",
          description: "Caches data in",
          technology: "Redis Protocol",
        });
      }
    }

    // Detect Message Queue
    if (content.includes("queue") || content.includes("kafka") || 
        content.includes("rabbitmq") || content.includes("bull")) {
      containers.push({
        name: "Message Queue",
        description: "Message broker for async processing",
        type: "queue",
        technology: this.getQueueTech(context),
      });

      if (structure.hasBackend) {
        relationships.push({
          source: "API Server",
          target: "Message Queue",
          description: "Publishes events to",
          technology: "AMQP/Kafka Protocol",
        });
      }
    }

    // Default container if nothing detected
    if (containers.length === 0) {
      containers.push({
        name: "Application",
        description: "Main application",
        type: "service",
        technology: techStack.length > 0 ? techStack.join(", ") : "Unknown",
      });
    }

    return { containers, relationships };
  }

  // Detect technology stack
  private detectTechStack(context: AnalysisContext): string[] {
    const tech: string[] = [];
    const files = Array.from(context.fileContents.keys());

    if (files.some(f => f.endsWith(".ts") || f.endsWith(".tsx"))) tech.push("TypeScript");
    else if (files.some(f => f.endsWith(".js") || f.endsWith(".jsx"))) tech.push("JavaScript");
    if (files.some(f => f.endsWith(".py"))) tech.push("Python");
    if (files.some(f => f.endsWith(".go"))) tech.push("Go");
    if (files.some(f => f.endsWith(".java"))) tech.push("Java");
    if (files.some(f => f.endsWith(".rs"))) tech.push("Rust");
    if (files.some(f => f.endsWith(".rb"))) tech.push("Ruby");

    return tech;
  }

  // Get frontend technology string
  private getFrontendTech(techStack: string[]): string {
    const tech: string[] = [];
    
    if (techStack.includes("TypeScript")) tech.push("TypeScript");
    else if (techStack.includes("JavaScript")) tech.push("JavaScript");
    
    tech.push("React"); // Assume React as default for now
    
    return tech.join(", ");
  }

  // Get backend technology string
  private getBackendTech(techStack: string[]): string {
    const tech: string[] = [];
    
    if (techStack.includes("TypeScript")) tech.push("TypeScript", "Node.js");
    else if (techStack.includes("JavaScript")) tech.push("JavaScript", "Node.js");
    else tech.push(...techStack);
    
    return tech.join(", ");
  }

  // Get database technology
  private getDatabaseTech(context: AnalysisContext): string {
    const files = Array.from(context.fileContents.keys());
    
    if (files.some(f => f.includes("prisma"))) return "PostgreSQL/MySQL (Prisma ORM)";
    if (files.some(f => f.includes("mongoose") || f.includes("mongodb"))) return "MongoDB";
    if (files.some(f => f.includes("postgres") || f.includes("pg"))) return "PostgreSQL";
    if (files.some(f => f.includes("mysql"))) return "MySQL";
    if (files.some(f => f.includes("sqlite"))) return "SQLite";
    
    return "SQL Database";
  }

  // Get queue technology
  private getQueueTech(context: AnalysisContext): string {
    const files = Array.from(context.fileContents.keys());
    const content = Array.from(context.fileContents.keys()).join(" ");
    
    if (content.includes("kafka")) return "Apache Kafka";
    if (content.includes("rabbitmq")) return "RabbitMQ";
    if (content.includes("bull")) return "Redis (Bull)";
    if (content.includes("sqs")) return "AWS SQS";
    
    return "Message Queue";
  }

  // Calculate confidence score
  private calculateConfidence(
    structure: ReturnType<typeof this.analyzeFileStructure>
  ): number {
    let score = 0.5; // Base confidence

    // More files = higher confidence
    if (structure.totalFiles > 50) score += 0.1;
    if (structure.totalFiles > 100) score += 0.1;

    // Clear architecture = higher confidence
    if (structure.hasFrontend && structure.hasBackend) score += 0.15;
    if (structure.hasDatabase) score += 0.1;
    if (structure.hasTests) score += 0.05;

    return Math.min(score, 1.0);
  }
}
