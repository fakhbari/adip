// ADR Agent - Detects existing ADRs and suggests new ones

import { BaseAgent, createAgentConfig } from "./base-agent";
import { 
  AgentResult, 
  AnalysisContext, 
  ADRResult,
  DetectedADR,
  ADRSuggestion,
} from "./types";
import { FILE_PATTERNS } from "@/lib/vcs";

// ADR file patterns
const ADR_FILENAME_PATTERNS = [
  /ADR[-_]?(\d+)/i,
  /(\d{4})[-_].*\.md$/,
  /decision[-_]?(\d+)/i,
  /(\d+)[-_].*\.md$/,
];

// Patterns that suggest architectural decisions
const DECISION_PATTERNS = [
  {
    name: "Authentication Strategy",
    patterns: ["passport", "jwt", "next-auth", "auth0", "cognito", "oauth", "openid"],
    description: "Authentication mechanism choice",
    priority: "high" as const,
  },
  {
    name: "Database Selection",
    patterns: ["postgresql", "mongodb", "mysql", "redis", "elasticsearch", "prisma", "typeorm", "sequelize"],
    description: "Database technology choice",
    priority: "high" as const,
  },
  {
    name: "API Style",
    patterns: ["graphql", "rest", "grpc", "trpc", "openapi", "swagger"],
    description: "API architecture style",
    priority: "high" as const,
  },
  {
    name: "State Management",
    patterns: ["redux", "mobx", "zustand", "recoil", "pinia", "vuex"],
    description: "Frontend state management approach",
    priority: "medium" as const,
  },
  {
    name: "Testing Strategy",
    patterns: ["jest", "vitest", "cypress", "playwright", "mocha", "pytest"],
    description: "Testing framework and strategy",
    priority: "medium" as const,
  },
  {
    name: "Build Tool",
    patterns: ["webpack", "vite", "esbuild", "rollup", "parcel", "turbo"],
    description: "Build toolchain selection",
    priority: "low" as const,
  },
  {
    name: "Cloud Provider",
    patterns: ["aws-sdk", "@azure", "@google-cloud", "vercel", "netlify", "cloudflare"],
    description: "Cloud infrastructure choice",
    priority: "high" as const,
  },
  {
    name: "Message Queue",
    patterns: ["kafka", "rabbitmq", "bull", "sqs", "redis queue"],
    description: "Async messaging architecture",
    priority: "medium" as const,
  },
  {
    name: "Caching Strategy",
    patterns: ["redis", "memcached", "cdn", "edge cache"],
    description: "Caching layer implementation",
    priority: "medium" as const,
  },
  {
    name: "ORM Selection",
    patterns: ["prisma", "typeorm", "sequelize", "knex", "drizzle", "sqlalchemy"],
    description: "Database ORM/Query builder choice",
    priority: "medium" as const,
  },
];

export class ADRAgent extends BaseAgent {
  private adrCounter = 0;

  constructor() {
    super(createAgentConfig("adr"));
  }

  async analyze(context: AnalysisContext): Promise<AgentResult> {
    const startTime = Date.now();
    const existingADRs: DetectedADR[] = [];
    const suggestedADRs: ADRSuggestion[] = [];

    this.updateProgress(5, "Scanning for existing ADRs...");

    // Find existing ADR files
    const adrFiles = await this.findADRFiles(context);
    
    this.updateProgress(30, "Parsing existing ADRs...");

    // Parse existing ADRs
    for (const [path, content] of adrFiles) {
      const adr = this.parseADRFile(path, content);
      if (adr) {
        existingADRs.push(adr);
      }
    }

    this.updateProgress(50, "Analyzing codebase for architectural decisions...");

    // Analyze codebase for architectural decisions
    const detectedDecisions = await this.analyzeDecisions(context);

    this.updateProgress(70, "Generating ADR suggestions...");

    // Generate suggestions for missing ADRs
    const coveredTopics = new Set(
      existingADRs.map(adr => adr.title.toLowerCase())
    );

    for (const decision of detectedDecisions) {
      // Check if this decision already has an ADR
      const isCovered = Array.from(coveredTopics).some(topic => 
        topic.includes(decision.name.toLowerCase()) ||
        decision.name.toLowerCase().includes(topic)
      );

      if (!isCovered) {
        suggestedADRs.push({
          title: `Use ${decision.name} for ${decision.description}`,
          rationale: this.generateRationale(decision, context),
          relatedFiles: decision.relatedFiles,
          priority: decision.priority,
        });
      }
    }

    this.updateProgress(90, "Finalizing results...");

    // Sort suggestions by priority
    suggestedADRs.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    this.filesAnalyzed = adrFiles.size + detectedDecisions.reduce(
      (sum, d) => sum + d.relatedFiles.length, 0
    );

    const result: ADRResult = {
      existingADRs,
      suggestedADRs: suggestedADRs.slice(0, 10), // Limit to top 10 suggestions
    };

    return {
      agentType: "adr",
      status: "success",
      data: result,
      duration: Date.now() - startTime,
      filesAnalyzed: this.filesAnalyzed,
    };
  }

  // Find ADR files in the repository
  private async findADRFiles(context: AnalysisContext): Promise<Map<string, string>> {
    const adrFiles = new Map<string, string>();

    for (const [path, content] of context.fileContents) {
      // Check if file matches ADR patterns
      const isADR = 
        // Standard ADR directory patterns
        /docs\/adr\//i.test(path) ||
        /architecture\/decisions\//i.test(path) ||
        /decisions\//i.test(path) ||
        /adr\//i.test(path) ||
        // Standard ADR filename patterns
        ADR_FILENAME_PATTERNS.some(p => p.test(path.split("/").pop() || "")) ||
        // Check content for ADR markers
        (content && (
          content.includes("Status:") && content.includes("Context") && content.includes("Decision") ||
          content.includes("# ADR") ||
          content.includes("Architecture Decision Record")
        ));

      if (isADR && content) {
        adrFiles.set(path, content);
      }
    }

    return adrFiles;
  }

  // Parse an ADR file
  private parseADRFile(path: string, content: string): DetectedADR | null {
    try {
      // Extract ADR number from filename
      const filename = path.split("/").pop() || "";
      let number = this.adrCounter + 1;

      for (const pattern of ADR_FILENAME_PATTERNS) {
        const match = filename.match(pattern);
        if (match && match[1]) {
          number = parseInt(match[1], 10);
          break;
        }
      }

      // Parse markdown content
      const lines = content.split("\n");
      let title = "";
      let status: DetectedADR["status"] = "proposed";
      let context = "";
      let decision = "";
      let consequences = "";
      let alternatives = "";

      let currentSection = "";
      let sectionContent: string[] = [];

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Title detection
        if (trimmedLine.startsWith("# ") && !title) {
          title = trimmedLine.substring(2).replace(/^ADR[-_]?\d*[:\s]*/i, "").trim();
          continue;
        }

        // Section headers
        if (trimmedLine.startsWith("## ") || trimmedLine.startsWith("# ")) {
          // Save previous section
          if (currentSection && sectionContent.length > 0) {
            this.assignSection(currentSection, sectionContent.join("\n").trim(), {
              status: (s: string) => { status = s as DetectedADR["status"]; },
              context: (c: string) => { context = c; },
              decision: (d: string) => { decision = d; },
              consequences: (c: string) => { consequences = c; },
              alternatives: (a: string) => { alternatives = a; },
            });
          }

          currentSection = trimmedLine.substring(3).toLowerCase();
          sectionContent = [];
        } else if (currentSection) {
          sectionContent.push(line);
        }
      }

      // Save last section
      if (currentSection && sectionContent.length > 0) {
        this.assignSection(currentSection, sectionContent.join("\n").trim(), {
          status: (s: string) => { status = s as DetectedADR["status"]; },
          context: (c: string) => { context = c; },
          decision: (d: string) => { decision = d; },
          consequences: (c: string) => { consequences = c; },
          alternatives: (a: string) => { alternatives = a; },
        });
      }

      // Default title from filename if not found
      if (!title) {
        title = filename.replace(/\.md$/, "").replace(/[-_]/g, " ");
      }

      this.adrCounter = Math.max(this.adrCounter, number);

      return {
        number,
        title,
        status,
        context: context || "No context provided",
        decision: decision || "No decision recorded",
        consequences: consequences || undefined,
        alternatives: alternatives || undefined,
        source: "existing",
        filePath: path,
      };
    } catch (error) {
      console.error(`Error parsing ADR file ${path}:`, error);
      return null;
    }
  }

  // Assign content to appropriate section
  private assignSection(
    section: string,
    content: string,
    setters: {
      status: (s: string) => void;
      context: (c: string) => void;
      decision: (d: string) => void;
      consequences: (c: string) => void;
      alternatives: (a: string) => void;
    }
  ): void {
    const lowerSection = section.toLowerCase();

    if (lowerSection.includes("status")) {
      const statusMap: Record<string, DetectedADR["status"]> = {
        "proposed": "proposed",
        "accepted": "accepted",
        "rejected": "rejected",
        "deprecated": "deprecated",
        "superseded": "superseded",
        "draft": "proposed",
        "pending": "proposed",
      };
      
      for (const [key, value] of Object.entries(statusMap)) {
        if (content.toLowerCase().includes(key)) {
          setters.status(value);
          break;
        }
      }
    } else if (lowerSection.includes("context") || lowerSection.includes("background")) {
      setters.context(content);
    } else if (lowerSection.includes("decision")) {
      setters.decision(content);
    } else if (lowerSection.includes("consequence")) {
      setters.consequences(content);
    } else if (lowerSection.includes("alternative")) {
      setters.alternatives(content);
    }
  }

  // Analyze codebase for architectural decisions
  private async analyzeDecisions(
    context: AnalysisContext
  ): Promise<Array<{
    name: string;
    description: string;
    relatedFiles: string[];
    priority: "high" | "medium" | "low";
  }>> {
    const decisions: Array<{
      name: string;
      description: string;
      relatedFiles: string[];
      priority: "high" | "medium" | "low";
    }> = [];

    // Combine all file contents for analysis
    const allContent = Array.from(context.fileContents.entries());

    for (const { name, patterns, description, priority } of DECISION_PATTERNS) {
      const relatedFiles: string[] = [];
      let found = false;

      for (const [path, content] of allContent) {
        // Check package.json or dependency files more thoroughly
        if (content) {
          const hasPattern = patterns.some(p => 
            content.toLowerCase().includes(p.toLowerCase())
          );

          if (hasPattern) {
            found = true;
            if (!relatedFiles.includes(path)) {
              relatedFiles.push(path);
            }
          }
        }
      }

      if (found) {
        decisions.push({
          name,
          description,
          relatedFiles: relatedFiles.slice(0, 5), // Limit to 5 related files
          priority,
        });
      }
    }

    return decisions;
  }

  // Generate rationale for ADR suggestion
  private generateRationale(
    decision: { name: string; description: string; relatedFiles: string[] },
    context: AnalysisContext
  ): string {
    const rationale = [
      `The codebase uses ${decision.name} as the ${decision.description}.`,
    ];

    if (decision.relatedFiles.length > 0) {
      rationale.push(`This is evidenced in: ${decision.relatedFiles.slice(0, 3).join(", ")}.`);
    }

    rationale.push(
      `This decision should be documented to provide context for future development`,
      `and to help team members understand the architectural choices made.`
    );

    return rationale.join(" ");
  }
}
