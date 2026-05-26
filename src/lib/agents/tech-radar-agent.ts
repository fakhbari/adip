// Tech Radar Agent - Detects technologies, languages, and frameworks

import { BaseAgent, createAgentConfig } from "./base-agent";
import {
  AgentResult,
  AnalysisContext,
  DetectedTechnology,
  TechRadarResult,
} from "./types";
import { FILE_PATTERNS } from "@/lib/vcs";
import { z } from "zod";
import { runWithSchema, SchemaValidationError } from "@/lib/llm/structured";
import { PromptRegistry } from "@/lib/llm/prompt-registry";
import { logger } from "@/lib/logger";

const trLog = logger("agents.tech-radar");

// LLM pass output: per-tech ring + quadrant + rationale.
const TechClassificationSchema = z.array(
  z.object({
    name: z.string(),
    quadrant: z.enum(["techniques", "tools", "platforms", "languages-frameworks"]),
    ring: z.enum(["adopt", "trial", "assess", "hold"]),
    rationale: z.string(),
  })
);

// Technology mapping for common packages
const TECHNOLOGY_CATEGORIES: Record<string, { category: string; quadrant: "techniques" | "tools" | "platforms" | "languages-frameworks" }> = {
  // Languages & Frameworks
  "react": { category: "Frontend Framework", quadrant: "languages-frameworks" },
  "vue": { category: "Frontend Framework", quadrant: "languages-frameworks" },
  "angular": { category: "Frontend Framework", quadrant: "languages-frameworks" },
  "svelte": { category: "Frontend Framework", quadrant: "languages-frameworks" },
  "next": { category: "Full-stack Framework", quadrant: "languages-frameworks" },
  "nuxt": { category: "Full-stack Framework", quadrant: "languages-frameworks" },
  "express": { category: "Backend Framework", quadrant: "languages-frameworks" },
  "fastify": { category: "Backend Framework", quadrant: "languages-frameworks" },
  "nestjs": { category: "Backend Framework", quadrant: "languages-frameworks" },
  "django": { category: "Backend Framework", quadrant: "languages-frameworks" },
  "fastapi": { category: "Backend Framework", quadrant: "languages-frameworks" },
  "flask": { category: "Backend Framework", quadrant: "languages-frameworks" },
  "spring": { category: "Backend Framework", quadrant: "languages-frameworks" },
  "rails": { category: "Backend Framework", quadrant: "languages-frameworks" },
  "laravel": { category: "Backend Framework", quadrant: "languages-frameworks" },
  "gin": { category: "Backend Framework", quadrant: "languages-frameworks" },
  "actix": { category: "Backend Framework", quadrant: "languages-frameworks" },
  
  // Databases
  "pg": { category: "Database", quadrant: "platforms" },
  "postgres": { category: "Database", quadrant: "platforms" },
  "mysql": { category: "Database", quadrant: "platforms" },
  "mysql2": { category: "Database", quadrant: "platforms" },
  "mongodb": { category: "Database", quadrant: "platforms" },
  "mongoose": { category: "Database", quadrant: "platforms" },
  "redis": { category: "Database", quadrant: "platforms" },
  "ioredis": { category: "Database", quadrant: "platforms" },
  "elasticsearch": { category: "Database", quadrant: "platforms" },
  "prisma": { category: "ORM", quadrant: "tools" },
  "typeorm": { category: "ORM", quadrant: "tools" },
  "sequelize": { category: "ORM", quadrant: "tools" },
  "knex": { category: "Query Builder", quadrant: "tools" },
  "drizzle": { category: "ORM", quadrant: "tools" },
  "sqlalchemy": { category: "ORM", quadrant: "tools" },
  
  // Cloud & Infrastructure
  "aws-sdk": { category: "Cloud Provider", quadrant: "platforms" },
  "@aws-sdk": { category: "Cloud Provider", quadrant: "platforms" },
  "azure": { category: "Cloud Provider", quadrant: "platforms" },
  "@azure": { category: "Cloud Provider", quadrant: "platforms" },
  "google-cloud": { category: "Cloud Provider", quadrant: "platforms" },
  "@google-cloud": { category: "Cloud Provider", quadrant: "platforms" },
  "terraform": { category: "Infrastructure as Code", quadrant: "tools" },
  "docker": { category: "Containerization", quadrant: "platforms" },
  "kubernetes": { category: "Container Orchestration", quadrant: "platforms" },
  "k8s": { category: "Container Orchestration", quadrant: "platforms" },
  
  // Testing
  "jest": { category: "Testing Framework", quadrant: "tools" },
  "vitest": { category: "Testing Framework", quadrant: "tools" },
  "mocha": { category: "Testing Framework", quadrant: "tools" },
  "pytest": { category: "Testing Framework", quadrant: "tools" },
  "junit": { category: "Testing Framework", quadrant: "tools" },
  "cypress": { category: "E2E Testing", quadrant: "tools" },
  "playwright": { category: "E2E Testing", quadrant: "tools" },
  
  // Build Tools
  "webpack": { category: "Build Tool", quadrant: "tools" },
  "vite": { category: "Build Tool", quadrant: "tools" },
  "esbuild": { category: "Build Tool", quadrant: "tools" },
  "rollup": { category: "Build Tool", quadrant: "tools" },
  "parcel": { category: "Build Tool", quadrant: "tools" },
  "gulp": { category: "Build Tool", quadrant: "tools" },
  "gradle": { category: "Build Tool", quadrant: "tools" },
  "maven": { category: "Build Tool", quadrant: "tools" },
  
  // UI Libraries
  "tailwindcss": { category: "CSS Framework", quadrant: "languages-frameworks" },
  "bootstrap": { category: "CSS Framework", quadrant: "languages-frameworks" },
  "material-ui": { category: "UI Library", quadrant: "languages-frameworks" },
  "@mui": { category: "UI Library", quadrant: "languages-frameworks" },
  "chakra": { category: "UI Library", quadrant: "languages-frameworks" },
  "antd": { category: "UI Library", quadrant: "languages-frameworks" },
  
  // State Management
  "redux": { category: "State Management", quadrant: "techniques" },
  "zustand": { category: "State Management", quadrant: "techniques" },
  "mobx": { category: "State Management", quadrant: "techniques" },
  "recoil": { category: "State Management", quadrant: "techniques" },
  "pinia": { category: "State Management", quadrant: "techniques" },
  
  // API & Communication
  "axios": { category: "HTTP Client", quadrant: "tools" },
  "fetch": { category: "HTTP Client", quadrant: "tools" },
  "graphql": { category: "API", quadrant: "techniques" },
  "apollo": { category: "GraphQL Client", quadrant: "tools" },
  "urql": { category: "GraphQL Client", quadrant: "tools" },
  "socket.io": { category: "WebSocket", quadrant: "tools" },
  "ws": { category: "WebSocket", quadrant: "tools" },
  
  // Authentication
  "next-auth": { category: "Authentication", quadrant: "tools" },
  "passport": { category: "Authentication", quadrant: "tools" },
  "jose": { category: "Authentication", quadrant: "tools" },
  "jsonwebtoken": { category: "Authentication", quadrant: "tools" },
  "auth0": { category: "Authentication", quadrant: "platforms" },
  
  // Utilities
  "lodash": { category: "Utility Library", quadrant: "tools" },
  "dayjs": { category: "Date Library", quadrant: "tools" },
  "moment": { category: "Date Library", quadrant: "tools" },
  "zod": { category: "Validation", quadrant: "tools" },
  "yup": { category: "Validation", quadrant: "tools" },
  "joi": { category: "Validation", quadrant: "tools" },
  
  // Message Queues
  "amqplib": { category: "Message Queue", quadrant: "tools" },
  "bull": { category: "Message Queue", quadrant: "tools" },
  "kafkajs": { category: "Message Queue", quadrant: "tools" },
  "kafka": { category: "Message Queue", quadrant: "tools" },
  "rabbitmq": { category: "Message Queue", quadrant: "tools" },
  
  // Monitoring & Logging
  "winston": { category: "Logging", quadrant: "tools" },
  "pino": { category: "Logging", quadrant: "tools" },
  "sentry": { category: "Monitoring", quadrant: "tools" },
  "datadog": { category: "Monitoring", quadrant: "tools" },
  "prometheus": { category: "Monitoring", quadrant: "tools" },
};

// Language detection from file extensions
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".go": "Go",
  ".rs": "Rust",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".swift": "Swift",
  ".scala": "Scala",
  ".cpp": "C++",
  ".c": "C",
  ".vue": "Vue",
  ".svelte": "Svelte",
};

export class TechRadarAgent extends BaseAgent {
  constructor() {
    super(createAgentConfig("tech-radar"));
  }

  async analyze(context: AnalysisContext): Promise<AgentResult> {
    const startTime = Date.now();
    const technologies: DetectedTechnology[] = [];
    const languagesSet = new Set<string>();
    const frameworksSet = new Set<string>();

    this.updateProgress(10, "Scanning dependency files...");

    // Get all dependency files
    const depFiles = Array.from(context.fileContents.entries())
      .filter(([path]) => 
        FILE_PATTERNS.dependencyFiles.some(pattern => pattern.test(path))
      );

    // Process each dependency file.
    // Previously this used `depFiles.indexOf([path, content])` to compute
    // progress — but `indexOf` on a freshly-constructed tuple always returns
    // -1 (array identity comparison), so the progress bar reported negative
    // / nonsensical values. Track the index explicitly.
    for (let i = 0; i < depFiles.length; i++) {
      const [path, content] = depFiles[i];
      this.updateProgress(
        20 + (i / Math.max(depFiles.length, 1)) * 40,
        `Analyzing ${path}...`
      );

      try {
        if (path.endsWith("package.json")) {
          const result = this.parsePackageJson(path, content);
          technologies.push(...result.technologies);
          result.frameworks.forEach(f => frameworksSet.add(f));
        } else if (path.endsWith("pom.xml")) {
          const result = this.parsePomXml(path, content);
          technologies.push(...result);
        } else if (path.endsWith("build.gradle") || path.endsWith("build.gradle.kts")) {
          const result = this.parseGradle(path, content);
          technologies.push(...result);
        } else if (path.endsWith("go.mod")) {
          const result = this.parseGoMod(path, content);
          technologies.push(...result);
        } else if (path.endsWith("requirements.txt") || path.endsWith("Pipfile")) {
          const result = this.parsePythonDeps(path, content);
          technologies.push(...result);
        } else if (path.endsWith("Cargo.toml")) {
          const result = this.parseCargoToml(path, content);
          technologies.push(...result);
        } else if (path.endsWith("Gemfile")) {
          const result = this.parseGemfile(path, content);
          technologies.push(...result);
        } else if (path.endsWith("composer.json")) {
          const result = this.parseComposerJson(path, content);
          technologies.push(...result);
        }
      } catch (error) {
        console.error(`Error parsing ${path}:`, error);
      }
    }

    this.updateProgress(65, "Detecting languages from source files...");

    // Detect languages from file extensions
    const sourceFiles = Array.from(context.fileContents.keys())
      .filter(path => FILE_PATTERNS.sourceFiles.some(pattern => pattern.test(path)));

    for (const path of sourceFiles) {
      const ext = "." + path.split(".").pop();
      if (LANGUAGE_EXTENSIONS[ext]) {
        languagesSet.add(LANGUAGE_EXTENSIONS[ext]);
      }
    }

    this.updateProgress(75, "Determining technology radar positions...");

    // Regex pre-pass classification (lookup table).
    for (const tech of technologies) {
      tech.ring = this.determineRadarRing(tech);
    }

    // Phase 2.5 — LLM pass. If a provider is wired, ask it to refine the
    // ring/quadrant/rationale for the detected list. Failure keeps the
    // regex pre-pass classification so the analysis still completes.
    if (context.llm && technologies.length > 0) {
      this.updateProgress(82, "Classifying technologies via LLM...");
      try {
        const techList = technologies
          .slice(0, 100) // cap prompt size; 100 is plenty for 99% of repos
          .map((t) => `- ${t.name} (current: ${t.ring}, source: ${t.sourceFile})`)
          .join("\n");
        const locale = context.outputLocale ?? "fa";
        const prompt = await PromptRegistry.render({
          agent: "tech-radar",
          task: "classify",
          locale,
          vars: { techList },
        });
        const { data: classified } = await runWithSchema({
          provider: context.llm,
          messages: [{ role: "user", content: prompt }],
          schema: TechClassificationSchema,
          opts: { meta: { analysisRunId: context.analysisRunId, agentType: "tech-radar" } },
        });
        // Merge LLM classification back into the detected list by name.
        const byName = new Map(classified.map((c) => [c.name.toLowerCase(), c]));
        for (const tech of technologies) {
          const m = byName.get(tech.name.toLowerCase());
          if (m) {
            tech.ring = m.ring;
            tech.quadrant = m.quadrant;
            // Stash rationale in description for the radar UI.
            tech.description = m.rationale;
          }
        }
      } catch (err) {
        const reason =
          err instanceof SchemaValidationError
            ? "schema validation exhausted retries"
            : err instanceof Error
              ? err.message
              : String(err);
        trLog.warn({ reason }, "LLM classification skipped; regex pre-pass result kept");
      }
    }

    this.updateProgress(90, "Finalizing results...");

    const result: TechRadarResult = {
      technologies,
      languages: Array.from(languagesSet),
      frameworks: Array.from(frameworksSet),
    };

    this.filesAnalyzed = depFiles.length + sourceFiles.length;

    return {
      agentType: "tech-radar",
      status: "success",
      data: result,
      duration: Date.now() - startTime,
      filesAnalyzed: this.filesAnalyzed,
    };
  }

  // Parse package.json for Node.js projects
  private parsePackageJson(path: string, content: string): { technologies: DetectedTechnology[]; frameworks: string[] } {
    const technologies: DetectedTechnology[] = [];
    const frameworks: string[] = [];

    try {
      const pkg = JSON.parse(content);
      
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      };

      for (const [name, version] of Object.entries(allDeps)) {
        // Skip internal/private packages
        if (name.startsWith("@types/") || name.startsWith("@test/")) continue;
        
        const techInfo = this.getTechInfo(name);
        technologies.push({
          name: this.getDisplayName(name),
          category: techInfo?.category || "Library",
          version: this.extractVersion(version as string),
          sourceFile: path,
          quadrant: techInfo?.quadrant || "tools",
          ring: "assess",
          confidence: techInfo ? 0.9 : 0.6,
        });

        // Track frameworks
        if (techInfo?.category?.includes("Framework")) {
          frameworks.push(this.getDisplayName(name));
        }
      }
    } catch (error) {
      console.error("Error parsing package.json:", error);
    }

    return { technologies, frameworks };
  }

  // Parse pom.xml for Java/Maven projects
  private parsePomXml(path: string, content: string): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = [];
    
    // Simple regex-based parsing for dependencies
    const depRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>(?:\s*<version>([^<]+)<\/version>)?/g;
    let match;

    while ((match = depRegex.exec(content)) !== null) {
      const [, groupId, artifactId, version] = match;
      const name = artifactId || groupId;
      const techInfo = this.getTechInfo(name);

      technologies.push({
        name: this.getDisplayName(name),
        category: techInfo?.category || "Library",
        version: version || undefined,
        sourceFile: path,
        quadrant: techInfo?.quadrant || "tools",
        ring: "assess",
        confidence: techInfo ? 0.9 : 0.6,
      });
    }

    return technologies;
  }

  // Parse build.gradle for Java/Gradle projects
  private parseGradle(path: string, content: string): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = [];
    
    // Simple regex-based parsing for dependencies
    const depRegex = /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*['"]([^:'"]+):([^:'"]+):([^:'"]+)['"]/g;
    let match;

    while ((match = depRegex.exec(content)) !== null) {
      const [, , name, version] = match;
      const techInfo = this.getTechInfo(name);

      technologies.push({
        name: this.getDisplayName(name),
        category: techInfo?.category || "Library",
        version,
        sourceFile: path,
        quadrant: techInfo?.quadrant || "tools",
        ring: "assess",
        confidence: techInfo ? 0.9 : 0.6,
      });
    }

    return technologies;
  }

  // Parse go.mod for Go projects
  private parseGoMod(path: string, content: string): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = [];
    
    const depRegex = /require\s*\(([^)]+)\)/s;
    const match = content.match(depRegex);
    
    if (match) {
      const lines = match[1].split("\n");
      for (const line of lines) {
        const depMatch = line.trim().match(/^([\w./-]+)\s+v?([\d.]+)/);
        if (depMatch) {
          const [, name, version] = depMatch;
          const techInfo = this.getTechInfo(name);

          technologies.push({
            name: this.getDisplayName(name),
            category: techInfo?.category || "Go Package",
            version,
            sourceFile: path,
            quadrant: techInfo?.quadrant || "languages-frameworks",
            ring: "assess",
            confidence: techInfo ? 0.9 : 0.6,
          });
        }
      }
    }

    return technologies;
  }

  // Parse Python requirements
  private parsePythonDeps(path: string, content: string): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+)\s*[=<>]+\s*([\d.]+)/);
      if (match) {
        const [, name, version] = match;
        const techInfo = this.getTechInfo(name);

        technologies.push({
          name: this.getDisplayName(name),
          category: techInfo?.category || "Python Package",
          version,
          sourceFile: path,
          quadrant: techInfo?.quadrant || "languages-frameworks",
          ring: "assess",
          confidence: techInfo ? 0.9 : 0.6,
        });
      }
    }

    return technologies;
  }

  // Parse Cargo.toml for Rust projects
  private parseCargoToml(path: string, content: string): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = [];
    
    const depRegex = /\[dependencies\]([\s\S]*?)(?:\[|$)/;
    const match = content.match(depRegex);
    
    if (match) {
      const lines = match[1].split("\n");
      for (const line of lines) {
        const depMatch = line.match(/^(\w+)\s*=\s*["']?([^"'\s]+)/);
        if (depMatch) {
          const [, name, version] = depMatch;
          const techInfo = this.getTechInfo(name);

          technologies.push({
            name: this.getDisplayName(name),
            category: techInfo?.category || "Rust Crate",
            version,
            sourceFile: path,
            quadrant: techInfo?.quadrant || "languages-frameworks",
            ring: "assess",
            confidence: techInfo ? 0.9 : 0.6,
          });
        }
      }
    }

    return technologies;
  }

  // Parse Gemfile for Ruby projects
  private parseGemfile(path: string, content: string): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = [];
    
    const depRegex = /gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/g;
    let match;

    while ((match = depRegex.exec(content)) !== null) {
      const [, name, version] = match;
      const techInfo = this.getTechInfo(name);

      technologies.push({
        name: this.getDisplayName(name),
        category: techInfo?.category || "Ruby Gem",
        version,
        sourceFile: path,
        quadrant: techInfo?.quadrant || "languages-frameworks",
        ring: "assess",
        confidence: techInfo ? 0.9 : 0.6,
      });
    }

    return technologies;
  }

  // Parse composer.json for PHP projects
  private parseComposerJson(path: string, content: string): DetectedTechnology[] {
    const technologies: DetectedTechnology[] = [];

    try {
      const pkg = JSON.parse(content);
      const allDeps = { ...pkg.require, ...pkg["require-dev"] };

      for (const [name, version] of Object.entries(allDeps)) {
        if (name === "php") continue;  // Skip PHP itself
        
        const techInfo = this.getTechInfo(name);

        technologies.push({
          name: this.getDisplayName(name),
          category: techInfo?.category || "PHP Package",
          version: this.extractVersion(version as string),
          sourceFile: path,
          quadrant: techInfo?.quadrant || "languages-frameworks",
          ring: "assess",
          confidence: techInfo ? 0.9 : 0.6,
        });
      }
    } catch (error) {
      console.error("Error parsing composer.json:", error);
    }

    return technologies;
  }

  // Get technology info from our mapping.
  //
  // Previously this matched both directions via `includes()`, which produced
  // a flood of false positives ("pg" matched "typescript", "react" matched
  // "react-native", "next" matched "next-auth").
  //
  // The replacement is strict — exact match only — with one explicit
  // exception for scoped npm packages: a name like "@aws-sdk/client-s3"
  // should still match the "@aws-sdk" entry in the table.
  private getTechInfo(name: string): { category: string; quadrant: "techniques" | "tools" | "platforms" | "languages-frameworks" } | null {
    const lower = name.toLowerCase();
    const normalized = lower.replace(/^@[^/]+\//, "");

    // 1. Exact match on the normalized form (covers `react`, `next`, etc).
    const byNormalized = TECHNOLOGY_CATEGORIES[normalized as keyof typeof TECHNOLOGY_CATEGORIES];
    if (byNormalized) return byNormalized;

    // 2. Exact match on the original form (covers `next-auth`, `react-native`
    //    when they appear as keys in the table — keeps them distinct from
    //    `next` / `react`).
    const byLower = TECHNOLOGY_CATEGORIES[lower as keyof typeof TECHNOLOGY_CATEGORIES];
    if (byLower) return byLower;

    // 3. Scoped-package prefix: "@scope/foo" against an "@scope" key.
    for (const key of Object.keys(TECHNOLOGY_CATEGORIES)) {
      if (key.startsWith("@") && lower.startsWith(key + "/")) {
        return TECHNOLOGY_CATEGORIES[key as keyof typeof TECHNOLOGY_CATEGORIES];
      }
    }

    return null;
  }

  // Get display name (clean up package name)
  private getDisplayName(name: string): string {
    // Remove scoped package prefix
    if (name.startsWith("@")) {
      const parts = name.split("/");
      return parts[parts.length - 1];
    }
    return name;
  }

  // Extract version from npm-style version string
  private extractVersion(version: string): string | undefined {
    if (!version) return undefined;
    // Remove ^, ~, >=, etc.
    return version.replace(/^[\^~>=<]+/, "").split(" ")[0];
  }

  // Determine radar ring based on technology maturity and usage.
  //
  // Same false-positive problem as getTechInfo — substring `includes()`
  // matched "react-native" → "react" → adopt, "next-auth" → "next" → adopt.
  // Use the same exact-or-separator-prefix scheme.
  private determineRadarRing(tech: DetectedTechnology): "adopt" | "trial" | "assess" | "hold" {
    const adoptTechnologies = [
      "react", "vue", "express", "django", "postgresql", "redis",
      "docker", "jest", "webpack", "tailwindcss", "typescript",
      "next", "prisma", "axios", "zod", "pino", "winston",
    ];

    const trialTechnologies = [
      "svelte", "fastify", "nestjs", "vite", "playwright", "vitest",
      "drizzle", "bull", "kafkajs", "zustand", "pinia",
    ];

    // Technologies to hold (deprecated or risky)
    const holdTechnologies = [
      "moment", "request", "jquery", "babel-core", "gulp",
    ];

    const nameLower = tech.name.toLowerCase();
    // Strict exact match — same reasoning as getTechInfo. Variants like
    // "next-auth" or "react-native" get their own entries (or fall through
    // to "assess") rather than being silently bucketed with `next` / `react`.
    const matches = (list: string[]) => list.some((t) => nameLower === t);

    if (matches(holdTechnologies)) return "hold";
    if (matches(adoptTechnologies)) return "adopt";
    if (matches(trialTechnologies)) return "trial";
    return "assess";
  }
}
