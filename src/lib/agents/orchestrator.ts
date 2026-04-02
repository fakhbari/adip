// Agent Orchestrator - Coordinates Multi-Agent Analysis

import { db } from "@/lib/db";
import { createVCSClient, parseRepositoryUrl, FILE_PATTERNS, VCSClient, VCSFile } from "@/lib/vcs";
import { BaseAgent, createAgentConfig } from "./base-agent";
import { 
  AgentType, 
  AgentResult, 
  AgentProgress, 
  AnalysisContext, 
  RepositoryContext,
  FileInfo,
  WSProgressMessage,
  WSAnalysisCompleteMessage,
} from "./types";
import { TechRadarAgent } from "./tech-radar-agent";
import { C4Agent } from "./c4-agent";
import { ADRAgent } from "./adr-agent";
import { OpenAPIAgent } from "./openapi-agent";

// ============================================
// Orchestrator Configuration
// ============================================

export interface OrchestratorConfig {
  analysisRunId: string;
  repositoryId: string;
  triggeredBy: "manual" | "scheduler" | "webhook";
  enabledAgents?: AgentType[];  // If not specified, run all agents
}

// ============================================
// Analysis Orchestrator
// ============================================

export class AgentOrchestrator {
  private config: OrchestratorConfig;
  private agents: BaseAgent[] = [];
  private results: AgentResult[] = [];
  private vcsClient: VCSClient | null = null;
  private repository: RepositoryContext | null = null;
  private startTime: number = 0;
  private wsPort: number = 3003;  // WebSocket service port

  // Progress callback
  private onProgress?: (message: WSProgressMessage) => void;
  private onComplete?: (message: WSAnalysisCompleteMessage) => void;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.initializeAgents();
  }

  // Set callbacks for WebSocket notifications
  setCallbacks(
    onProgress: (message: WSProgressMessage) => void,
    onComplete: (message: WSAnalysisCompleteMessage) => void
  ) {
    this.onProgress = onProgress;
    this.onComplete = onComplete;
  }

  // Initialize agents based on config
  private initializeAgents() {
    const enabledAgents = this.config.enabledAgents || [
      "tech-radar",
      "c4", 
      "adr",
      "openapi",
    ];

    const agentConstructors: Record<AgentType, new () => BaseAgent> = {
      "tech-radar": TechRadarAgent,
      "c4": C4Agent,
      "adr": ADRAgent,
      "openapi": OpenAPIAgent,
      "asyncapi": OpenAPIAgent,  // Same agent handles both
    };

    this.agents = enabledAgents
      .map((type) => {
        const AgentClass = agentConstructors[type];
        if (!AgentClass) return null;
        
        const agent = new AgentClass();
        return agent;
      })
      .filter((agent): agent is BaseAgent => agent !== null)
      .sort((a, b) => {
        const configA = createAgentConfig(a["config"]?.type || "tech-radar");
        const configB = createAgentConfig(b["config"]?.type || "tech-radar");
        return configA.priority - configB.priority;
      });
  }

  // Send progress update
  private sendProgress(progress: AgentProgress) {
    if (this.onProgress && this.repository) {
      this.onProgress({
        analysisRunId: this.config.analysisRunId,
        repositoryId: this.config.repositoryId,
        progress,
      });
    }
  }

  // Main execution method
  async execute(): Promise<AgentResult[]> {
    this.startTime = Date.now();
    this.results = [];

    try {
      // Step 1: Load repository context
      await this.loadRepositoryContext();
      this.sendProgress({
        agentId: "orchestrator",
        agentType: "tech-radar",
        status: "running",
        progress: 5,
        message: "Loading repository context...",
        timestamp: new Date(),
      });

      // Step 2: Initialize VCS client and fetch files
      await this.initializeVCSClient();
      this.sendProgress({
        agentId: "orchestrator",
        agentType: "tech-radar",
        status: "running",
        progress: 10,
        message: "Fetching repository files...",
        timestamp: new Date(),
      });

      // Step 3: Fetch relevant files
      const fileContents = await this.fetchAnalysisFiles();
      this.sendProgress({
        agentId: "orchestrator",
        agentType: "tech-radar",
        status: "running",
        progress: 15,
        message: `Fetched ${fileContents.size} files for analysis`,
        timestamp: new Date(),
      });

      // Step 4: Build analysis context
      const context: AnalysisContext = {
        repository: this.repository!,
        analysisRunId: this.config.analysisRunId,
        triggeredBy: this.config.triggeredBy,
        aiProvider: this.repository!.aiProvider!,
        fileContents,
        fileTree: Array.from(fileContents.keys()).map((path) => ({
          path,
          type: "file" as const,
        })),
      };

      // Step 5: Run agents in sequence
      const progressPerAgent = 80 / this.agents.length;
      let currentProgress = 20;

      for (const agent of this.agents) {
        // Set progress callback for agent
        agent.setProgressCallback((progress) => {
          this.sendProgress(progress);
        });

        // Execute agent
        const result = await agent.execute(context);
        this.results.push(result);

        currentProgress += progressPerAgent;
        this.sendProgress({
          agentId: "orchestrator",
          agentType: result.agentType,
          status: "running",
          progress: Math.round(currentProgress),
          message: `Completed ${agent["config"]?.name || "agent"}`,
          timestamp: new Date(),
        });
      }

      // Step 6: Save results to database
      await this.saveResults();
      this.sendProgress({
        agentId: "orchestrator",
        agentType: "tech-radar",
        status: "completed",
        progress: 95,
        message: "Saving results to database...",
        timestamp: new Date(),
      });

      // Step 7: Update analysis run status
      await this.updateAnalysisRun("COMPLETED");

      // Step 8: Send completion notification
      const duration = Date.now() - this.startTime;
      if (this.onComplete && this.repository) {
        this.onComplete({
          analysisRunId: this.config.analysisRunId,
          repositoryId: this.config.repositoryId,
          status: "completed",
          results: this.results,
          duration,
          documentsGenerated: this.results.filter((r) => r.status === "success").length,
        });
      }

      return this.results;
    } catch (error) {
      console.error("Orchestrator error:", error);
      
      // Update analysis run as failed
      await this.updateAnalysisRun("FAILED", error instanceof Error ? error.message : "Unknown error");

      // Send error notification
      if (this.onComplete && this.repository) {
        this.onComplete({
          analysisRunId: this.config.analysisRunId,
          repositoryId: this.config.repositoryId,
          status: "failed",
          results: this.results,
          duration: Date.now() - this.startTime,
          documentsGenerated: 0,
        });
      }

      throw error;
    }
  }

  // Load repository context from database
  private async loadRepositoryContext(): Promise<void> {
    const repo = await db.repository.findUnique({
      where: { id: this.config.repositoryId },
      include: {
        connection: true,
        aiProvider: true,
      },
    });

    if (!repo) {
      throw new Error(`Repository not found: ${this.config.repositoryId}`);
    }

    // If no AI provider set, get default
    let aiProvider = repo.aiProvider;
    if (!aiProvider) {
      aiProvider = await db.aIProvider.findFirst({
        where: { isDefault: true, isActive: true },
      });
    }

    if (!aiProvider) {
      throw new Error("No AI provider configured. Please set up a default AI provider.");
    }

    this.repository = {
      id: repo.id,
      name: repo.name,
      slug: repo.slug,
      description: repo.description,
      languages: repo.languages,
      frameworks: repo.frameworks,
      defaultBranch: repo.defaultBranch,
      lastCommitHash: repo.lastCommitHash,
      repositoryPath: repo.repositoryPath,
      repositoryUrl: repo.repositoryUrl,
      connection: repo.connection ? {
        id: repo.connection.id,
        name: repo.connection.name,
        type: repo.connection.type as any,
        url: repo.connection.url,
        accessToken: repo.connection.accessToken,
        username: repo.connection.username,
      } : null,
      aiProvider,
    };
  }

  // Initialize VCS client
  private async initializeVCSClient(): Promise<void> {
    // Try to get VCS info from repository URL or connection
    let vcsType: "github" | "gitlab" | "bitbucket" | null = null;
    let owner = "";
    let repo = "";

    // First, try repositoryPath (org/repo-name format)
    if (this.repository?.repositoryPath) {
      const parts = this.repository.repositoryPath.split("/");
      if (parts.length >= 2) {
        owner = parts[0];
        repo = parts[1];
      }
    }

    // If no path, try to extract from repositoryUrl or externalId
    if (!owner || !repo) {
      if (this.repository?.repositoryUrl) {
        const parsed = parseRepositoryUrl(this.repository.repositoryUrl);
        if (parsed) {
          vcsType = parsed.type;
          owner = parsed.owner;
          repo = parsed.repo;
        }
      }
    }

    // If still no owner/repo and there's a connection, use connection type
    if ((!owner || !repo) && this.repository?.connection) {
      vcsType = this.repository.connection.type as any;
      // Try to get path from connection URL + repository name
      // This handles cases where connection.url is base URL (e.g., "https://github.com")
      // and repository name is just the repo name
    }

    // If we have connection but no owner/repo, throw error
    if (this.repository?.connection && (!owner || !repo)) {
      throw new Error(
        `Repository "${this.repository.name}" is missing repositoryPath. ` +
        `Please set the repository path (e.g., "owner/repo-name") in the repository settings.`
      );
    }

    if (!vcsType && this.repository?.connection) {
      vcsType = this.repository.connection.type as any;
    }

    if (!vcsType) {
      throw new Error("Cannot determine VCS type for repository");
    }

    // Create VCS client
    if (this.repository?.connection) {
      this.vcsClient = createVCSClient({
        id: this.repository.connection.id,
        name: this.repository.connection.name,
        type: vcsType,
        url: this.repository.connection.url,
        accessToken: this.repository.connection.accessToken,
        username: this.repository.connection.username,
      });
    } else {
      // Public repository - no auth
      const { createPublicVCSClient } = await import("@/lib/vcs");
      this.vcsClient = createPublicVCSClient(vcsType);
    }

    // Store owner/repo for later use
    (this as any)._vcsOwner = owner;
    (this as any)._vcsRepo = repo;
  }

  // Fetch files for analysis
  private async fetchAnalysisFiles(): Promise<Map<string, string>> {
    if (!this.vcsClient) {
      throw new Error("VCS client not initialized");
    }

    const owner = (this as any)._vcsOwner;
    const repo = (this as any)._vcsRepo;
    const branch = this.repository?.defaultBranch || "main";

    // Get full file tree
    let fileTree: VCSFile[] = [];
    try {
      if ("getFullTree" in this.vcsClient) {
        fileTree = await (this.vcsClient as any).getFullTree(owner, repo, branch);
      } else {
        // Fallback: get root contents
        fileTree = await this.vcsClient.getFileTree(owner, repo, branch, "");
      }
    } catch (error) {
      console.error("Error fetching file tree:", error);
      // Continue with empty tree - will try to fetch key files
    }

    // Determine which files to fetch
    const pathsToFetch: string[] = [];

    // Always fetch dependency files
    for (const file of fileTree) {
      if (FILE_PATTERNS.dependencyFiles.some((pattern) => pattern.test(file.path))) {
        pathsToFetch.push(file.path);
      }
    }

    // Fetch config files
    for (const file of fileTree) {
      if (FILE_PATTERNS.configFiles.some((pattern) => pattern.test(file.path))) {
        pathsToFetch.push(file.path);
      }
    }

    // Fetch ADR files
    for (const file of fileTree) {
      if (FILE_PATTERNS.adrFiles.some((pattern) => pattern.test(file.path))) {
        pathsToFetch.push(file.path);
      }
    }

    // Fetch API definition files
    for (const file of fileTree) {
      if (FILE_PATTERNS.apiFiles.some((pattern) => pattern.test(file.path))) {
        pathsToFetch.push(file.path);
      }
    }

    // Fetch documentation files
    for (const file of fileTree) {
      if (FILE_PATTERNS.docsFiles.some((pattern) => pattern.test(file.path))) {
        pathsToFetch.push(file.path);
      }
    }

    // Sample some source files (limit to avoid too many files)
    const sourceFiles = fileTree.filter((f) =>
      FILE_PATTERNS.sourceFiles.some((pattern) => pattern.test(f.path))
    );
    const sampledSourceFiles = this.sampleFiles(sourceFiles, 50);  // Max 50 source files
    pathsToFetch.push(...sampledSourceFiles.map((f) => f.path));

    // Deduplicate
    const uniquePaths = [...new Set(pathsToFetch)];

    // Fetch all files
    return await this.vcsClient.getMultipleFiles(owner, repo, branch, uniquePaths);
  }

  // Sample files evenly across directories
  private sampleFiles(files: VCSFile[], maxCount: number): VCSFile[] {
    if (files.length <= maxCount) return files;

    // Group by directory
    const byDir = new Map<string, VCSFile[]>();
    for (const file of files) {
      const dir = file.path.split("/").slice(0, -1).join("/") || "root";
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir)!.push(file);
    }

    // Sample from each directory
    const result: VCSFile[] = [];
    const perDir = Math.ceil(maxCount / byDir.size);
    
    for (const [, dirFiles] of byDir) {
      const sampled = dirFiles.slice(0, perDir);
      result.push(...sampled);
      if (result.length >= maxCount) break;
    }

    return result.slice(0, maxCount);
  }

  // Save results to database
  private async saveResults(): Promise<void> {
    for (const result of this.results) {
      if (result.status !== "success" || !result.data) continue;

      switch (result.agentType) {
        case "tech-radar":
          await this.saveTechRadarResults(result.data as any);
          break;
        case "c4":
          await this.saveC4Results(result.data as any);
          break;
        case "adr":
          await this.saveADRResults(result.data as any);
          break;
        case "openapi":
          await this.saveOpenAPIResults(result.data as any);
          break;
      }
    }

    // Update repository last analyzed time
    await db.repository.update({
      where: { id: this.config.repositoryId },
      data: { lastAnalyzedAt: new Date() },
    });
  }

  // Save Tech Radar results
  private async saveTechRadarResults(data: any): Promise<void> {
    const techRadarData = data as { technologies: any[]; languages: string[]; frameworks: string[] };
    
    if (!techRadarData.technologies) return;

    for (const tech of techRadarData.technologies) {
      // Find or create technology
      let technology = await db.technology.findUnique({
        where: { name: tech.name },
      });

      if (!technology) {
        technology = await db.technology.create({
          data: {
            name: tech.name,
            category: tech.category || "Unknown",
            description: tech.description || null,
          },
        });
      }

      // Create technology usage
      await db.technologyUsage.upsert({
        where: {
          repositoryId_technologyId: {
            repositoryId: this.config.repositoryId,
            technologyId: technology.id,
          },
        },
        create: {
          repositoryId: this.config.repositoryId,
          technologyId: technology.id,
          version: tech.version || null,
          sourceFile: tech.sourceFile || null,
        },
        update: {
          version: tech.version || null,
          sourceFile: tech.sourceFile || null,
        },
      });

      // Create/update radar item
      const quadrantMap: Record<string, any> = {
        techniques: "TECHNIQUES",
        tools: "TOOLS",
        platforms: "PLATFORMS",
        "languages-frameworks": "LANGUAGES_FRAMEWORKS",
      };

      const ringMap: Record<string, any> = {
        adopt: "ADOPT",
        trial: "TRIAL",
        assess: "ASSESS",
        hold: "HOLD",
      };

      await db.radarItem.upsert({
        where: {
          technologyId_quadrant: {
            technologyId: technology.id,
            quadrant: quadrantMap[tech.quadrant] || "LANGUAGES_FRAMEWORKS",
          },
        },
        create: {
          technologyId: technology.id,
          quadrant: quadrantMap[tech.quadrant] || "LANGUAGES_FRAMEWORKS",
          ring: ringMap[tech.ring] || "ASSESS",
          organizationPos: tech.ring || "assess",
          isActive: true,
        },
        update: {
          ring: ringMap[tech.ring] || "ASSESS",
          organizationPos: tech.ring || "assess",
        },
      });
    }

    // Update repository languages
    if (techRadarData.languages?.length > 0) {
      const existingLanguages = this.repository?.languages 
        ? JSON.parse(this.repository.languages) 
        : [];
      const allLanguages = [...new Set([...existingLanguages, ...techRadarData.languages])];
      
      await db.repository.update({
        where: { id: this.config.repositoryId },
        data: { languages: JSON.stringify(allLanguages) },
      });
    }

    // Update repository frameworks
    if (techRadarData.frameworks?.length > 0) {
      await db.repository.update({
        where: { id: this.config.repositoryId },
        data: { frameworks: JSON.stringify(techRadarData.frameworks) },
      });
    }
  }

  // Save C4 results
  private async saveC4Results(data: any): Promise<void> {
    const c4Data = data as { level1: any; level2: any };
    const repoName = this.repository?.name || "Repository";

    // Save Level 1 - Context
    if (c4Data.level1) {
      await db.document.upsert({
        where: {
          repositoryId_type: {
            repositoryId: this.config.repositoryId,
            type: "C4_CONTEXT",
          },
        },
        create: {
          repositoryId: this.config.repositoryId,
          type: "C4_CONTEXT",
          status: "COMPLETED",
          title: `${repoName} - System Context`,
          content: JSON.stringify(c4Data.level1, null, 2),
          generatedAt: new Date(),
          generatedBy: "c4-agent",
        },
        update: {
          status: "COMPLETED",
          content: JSON.stringify(c4Data.level1, null, 2),
          generatedAt: new Date(),
          generatedBy: "c4-agent",
        },
      });
    }

    // Save Level 2 - Containers
    if (c4Data.level2) {
      await db.document.upsert({
        where: {
          repositoryId_type: {
            repositoryId: this.config.repositoryId,
            type: "C4_CONTAINER",
          },
        },
        create: {
          repositoryId: this.config.repositoryId,
          type: "C4_CONTAINER",
          status: "COMPLETED",
          title: `${repoName} - Containers`,
          content: JSON.stringify(c4Data.level2, null, 2),
          generatedAt: new Date(),
          generatedBy: "c4-agent",
        },
        update: {
          status: "COMPLETED",
          content: JSON.stringify(c4Data.level2, null, 2),
          generatedAt: new Date(),
          generatedBy: "c4-agent",
        },
      });
    }
  }

  // Save ADR results
  private async saveADRResults(data: any): Promise<void> {
    const adrData = data as { existingADRs: any[]; suggestedADRs: any[] };

    if (!adrData.existingADRs) return;

    const statusMap: Record<string, any> = {
      proposed: "PROPOSED",
      accepted: "ACCEPTED",
      deprecated: "DEPRECATED",
      superseded: "SUPERSEDED",
      rejected: "REJECTED",
    };

    for (const adr of adrData.existingADRs) {
      await db.aDR.upsert({
        where: {
          repositoryId_number: {
            repositoryId: this.config.repositoryId,
            number: adr.number,
          },
        },
        create: {
          repositoryId: this.config.repositoryId,
          number: adr.number,
          title: adr.title,
          status: statusMap[adr.status] || "PROPOSED",
          context: adr.context || "",
          decision: adr.decision || "",
          consequences: adr.consequences || null,
          alternatives: adr.alternatives || null,
          relatedCommits: adr.relatedCommits ? JSON.stringify(adr.relatedCommits) : null,
        },
        update: {
          title: adr.title,
          status: statusMap[adr.status] || "PROPOSED",
          context: adr.context || "",
          decision: adr.decision || "",
          consequences: adr.consequences || null,
          alternatives: adr.alternatives || null,
        },
      });
    }
  }

  // Save OpenAPI results
  private async saveOpenAPIResults(data: any): Promise<void> {
    const openApiData = data as { openapiSpec?: string; endpoints: any[] };
    const repoName = this.repository?.name || "Repository";

    if (openApiData.openapiSpec) {
      await db.document.upsert({
        where: {
          repositoryId_type: {
            repositoryId: this.config.repositoryId,
            type: "OPENAPI",
          },
        },
        create: {
          repositoryId: this.config.repositoryId,
          type: "OPENAPI",
          status: "COMPLETED",
          title: `${repoName} - API Specification`,
          content: openApiData.openapiSpec,
          generatedAt: new Date(),
          generatedBy: "openapi-agent",
        },
        update: {
          status: "COMPLETED",
          content: openApiData.openapiSpec,
          generatedAt: new Date(),
          generatedBy: "openapi-agent",
        },
      });
    }
  }

  // Update analysis run status
  private async updateAnalysisRun(status: "COMPLETED" | "FAILED", error?: string): Promise<void> {
    await db.analysisRun.update({
      where: { id: this.config.analysisRunId },
      data: {
        status,
        completedAt: new Date(),
        duration: Math.round((Date.now() - this.startTime) / 1000),
        documentsGenerated: this.results.filter((r) => r.status === "success").length,
        errors: error ? JSON.stringify([error]) : null,
      },
    });
  }
}

// ============================================
// Run Analysis Helper
// ============================================

export async function runAnalysis(
  repositoryId: string,
  triggeredBy: "manual" | "scheduler" | "webhook" = "manual",
  enabledAgents?: AgentType[]
): Promise<{ analysisRunId: string }> {
  // Create analysis run record
  const analysisRun = await db.analysisRun.create({
    data: {
      repositoryId,
      triggeredBy,
      status: "QUEUED",
    },
  });

  // Create orchestrator
  const orchestrator = new AgentOrchestrator({
    analysisRunId: analysisRun.id,
    repositoryId,
    triggeredBy,
    enabledAgents,
  });

  // Update status to running
  await db.analysisRun.update({
    where: { id: analysisRun.id },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  // Run analysis (async - don't await)
  orchestrator.execute().catch(async (error) => {
    console.error("Analysis failed:", error);
    await db.analysisRun.update({
      where: { id: analysisRun.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errors: JSON.stringify([error.message]),
      },
    });
  });

  return { analysisRunId: analysisRun.id };
}
