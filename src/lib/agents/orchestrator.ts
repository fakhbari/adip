// Agent Orchestrator - Coordinates Multi-Agent Analysis

import { db } from "@/lib/db";
import { createVCSClient, parseRepositoryUrl, FILE_PATTERNS, VCSClient, VCSFile } from "@/lib/vcs";
import { decryptOptional } from "@/lib/crypto";
import { parseLanguages } from "@/lib/repo-fields";
import { logger } from "@/lib/logger";
import { agentDurationSeconds, analysisRunsTotal } from "@/lib/metrics";
import { RepoFileCache } from "./repo-file-cache";
import { createLLMProvider, type LLMProvider } from "@/lib/llm";
import { recordRunEvent } from "@/lib/run-events";

const orchLog = logger("orchestrator");
import type { DocumentType, Prisma } from "@prisma/client";

// Prisma transaction client type — the subset of `db` available inside
// `db.$transaction(async (tx) => …)`.
type PrismaTx = Omit<Prisma.TransactionClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

// Save-time payload shapes. Loosely typed because each agent returns its own
// data shape; the orchestrator just needs the fields it persists. Tightening
// these is Phase 5 follow-up.
type TechRadarSavePayload = {
  technologies?: Array<{
    name: string;
    category?: string;
    description?: string;
    version?: string;
    sourceFile?: string;
    quadrant: string;
    ring: string;
  }>;
  languages?: string[];
  frameworks?: string[];
};

type C4SavePayload = { level1?: unknown; level2?: unknown };

type ADRSavePayload = {
  existingADRs?: Array<{
    number: number;
    title: string;
    status: string;
    context?: string;
    decision?: string;
    consequences?: string;
    alternatives?: string;
    relatedCommits?: unknown;
  }>;
  suggestedADRs?: unknown[];
};

type OpenAPISavePayload = { openapiSpec?: string; endpoints?: unknown[] };
import { BaseAgent } from "./base-agent";
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
import { AsyncAPIAgent } from "./asyncapi-agent";
import { DataCatalogAgent } from "./data-catalog-agent";
import { ContextMapAgent } from "./context-map-agent";

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

  // VCS coordinates resolved during initializeVCSClient. Previously these were
  // stashed via `(this as any)._vcsOwner` — typed properties so the compiler
  // catches the null-check before fetchAnalysisFiles uses them.
  private vcsOwner: string | null = null;
  private vcsRepo: string | null = null;

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
      // Phase 3.1: dedicated AsyncAPIAgent (was aliased to OpenAPIAgent).
      "asyncapi": AsyncAPIAgent,
      // Phases 3.2 / 3.3:
      "data-catalog": DataCatalogAgent,
      "context-map": ContextMapAgent,
    };

    this.agents = enabledAgents
      .map((type) => {
        const AgentClass = agentConstructors[type];
        if (!AgentClass) return null;
        return new AgentClass();
      })
      .filter((agent): agent is BaseAgent => agent !== null)
      // Previously sorted by reading the protected `config` field via the
      // index signature (a["config"]?.type) and re-constructing a config to
      // get its priority — fragile under minification and broke encapsulation.
      // BaseAgent now exposes `getPriority()` directly.
      .sort((a, b) => a.getPriority() - b.getPriority());
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

  // Heartbeat — keeps `AnalysisRun.lastHeartbeatAt` fresh so the janitor
  // (src/lib/janitor.ts) doesn't flip an in-flight run to FAILED.
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  private startHeartbeat() {
    const tick = async () => {
      try {
        await db.analysisRun.update({
          where: { id: this.config.analysisRunId },
          data: { lastHeartbeatAt: new Date() },
        });
      } catch (err) {
        console.warn("orchestrator heartbeat failed:", err);
      }
    };
    void tick();
    this.heartbeatTimer = setInterval(tick, 10_000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  // Main execution method
  async execute(): Promise<AgentResult[]> {
    this.startTime = Date.now();
    this.results = [];
    this.startHeartbeat();

    // Polish P4.1 — record run-start so the run-detail UI has a timeline
    // anchor even if the orchestrator throws before its first agent.
    await recordRunEvent({
      analysisRunId: this.config.analysisRunId,
      type: "run-start",
      content: { repositoryId: this.config.repositoryId, triggeredBy: this.config.triggeredBy },
    });

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

      // Phase 1.4: incremental analysis scope. If we have a previous
      // snapshot for this repo, ask the VCS client for the diff and
      // expose the changed-path set on the context. Agents can opt-in to
      // skip work whose inputs are unchanged. Best-effort — failures
      // leave the scope undefined and the analysis runs as a full scan.
      let incrementalScope: Set<string> | undefined;
      let currentSha: string | undefined;
      try {
        const prev = await db.repoSnapshot.findFirst({
          where: { repositoryId: this.config.repositoryId },
          orderBy: { takenAt: "desc" },
        });
        const branches = await this.vcsClient!.getBranches(this.vcsOwner!, this.vcsRepo!);
        currentSha = branches.find((b) => b.isDefault)?.sha ?? branches[0]?.sha;
        if (prev && currentSha && prev.commitSha !== currentSha && this.vcsClient?.getDiff) {
          const changed = await this.vcsClient.getDiff(
            this.vcsOwner!,
            this.vcsRepo!,
            prev.commitSha,
            currentSha
          );
          incrementalScope = new Set(changed);
          orchLog.info(
            { changed: changed.length, prevSha: prev.commitSha, currSha: currentSha },
            "incremental scope computed"
          );
        }
      } catch (err) {
        orchLog.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "incremental scope computation failed; falling back to full scan"
        );
      }

      // Phase 2.5 — instantiate the LLM provider (if configured) so
      // agents can call it directly. A build failure here does not
      // fail the run — agents fall back to regex-only output.
      let llm: LLMProvider | undefined;
      if (this.repository!.aiProvider) {
        try {
          llm = createLLMProvider({
            ...this.repository!.aiProvider,
            apiKey: decryptOptional(this.repository!.aiProvider.apiKey),
          });
        } catch (err) {
          orchLog.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "could not build LLM provider; agents will run regex-only"
          );
        }
      }

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
        incrementalScope,
        currentSha,
        llm,
        outputLocale: "fa",
      };

      // Step 5: Run agents in sequence
      const progressPerAgent = 80 / this.agents.length;
      let currentProgress = 20;

      for (const agent of this.agents) {
        agent.setProgressCallback((progress) => {
          this.sendProgress(progress);
        });

        // Polish P4.1 — emit RunEvent for the per-agent timeline.
        // BaseAgent.execute() already catches inside agent code, but
        // these events are what the run-detail UI consumes.
        await recordRunEvent({
          analysisRunId: this.config.analysisRunId,
          type: "agent-start",
          agentType: agent.getType(),
        });
        const agentStart = Date.now();
        const result = await agent.execute(context);
        const seconds = (Date.now() - agentStart) / 1000;
        agentDurationSeconds.labels(result.agentType, result.status).observe(seconds);
        this.results.push(result);
        await recordRunEvent({
          analysisRunId: this.config.analysisRunId,
          type: result.status === "success" ? "agent-end" : "agent-failed",
          agentType: result.agentType,
          content: {
            duration: seconds,
            status: result.status,
            error: result.error,
            filesAnalyzed: result.filesAnalyzed,
          },
        });

        currentProgress += progressPerAgent;
        this.sendProgress({
          agentId: "orchestrator",
          agentType: result.agentType,
          status: "running",
          progress: Math.round(currentProgress),
          message: `Completed ${agent.getName()}`,
          timestamp: new Date(),
        });
      }

      // Step 6: Save results to database
      await this.saveResults();
      await recordRunEvent({
        analysisRunId: this.config.analysisRunId,
        type: "save-results",
        content: { agents: this.results.length, successes: this.results.filter((r) => r.status === "success").length },
      });
      this.sendProgress({
        agentId: "orchestrator",
        agentType: "tech-radar",
        status: "completed",
        progress: 95,
        message: "Saving results to database...",
        timestamp: new Date(),
      });

      // Phase 1.4: record the snapshot so the next analysis can diff
      // against it. Best-effort — a failure here does not fail the run.
      if (context.currentSha) {
        try {
          await db.repoSnapshot.create({
            data: { repositoryId: this.config.repositoryId, commitSha: context.currentSha },
          });
          await recordRunEvent({
            analysisRunId: this.config.analysisRunId,
            type: "snapshot-write",
            content: { commitSha: context.currentSha },
          });
        } catch (err) {
          orchLog.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "snapshot write failed"
          );
        }
      }

      // Step 7: Update analysis run status
      await this.updateAnalysisRun("COMPLETED");

      // Polish P4.1 — terminal event.
      await recordRunEvent({
        analysisRunId: this.config.analysisRunId,
        type: "run-complete",
        content: {
          durationMs: Date.now() - this.startTime,
          documentsGenerated: this.results.filter((r) => r.status === "success").length,
        },
      });

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
      orchLog.error(
        { err: error instanceof Error ? error.message : String(error), analysisRunId: this.config.analysisRunId },
        "orchestrator error"
      );

      // Polish P4.1 — terminal failure event before we touch the DB
      // (a DB-side failure must not eat the timeline).
      await recordRunEvent({
        analysisRunId: this.config.analysisRunId,
        type: "run-failed",
        content: { message: error instanceof Error ? error.message : String(error) },
      });

      // Update analysis run as failed (best-effort; janitor sweeps on DB outage).
      await this.updateAnalysisRun("FAILED", error instanceof Error ? error.message : "Unknown error").catch((err) => {
        orchLog.warn({ err: err instanceof Error ? err.message : String(err) }, "FAILED update itself failed");
      });

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
    } finally {
      this.stopHeartbeat();
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
      // Preserve the full Prisma row (matches RepositoryContext's typing) but
      // decrypt the token at the boundary. Stored as v1:… (Phase 2); legacy
      // plaintext rows pass through with a console.warn until the migration runs.
      connection: repo.connection
        ? { ...repo.connection, accessToken: decryptOptional(repo.connection.accessToken) }
        : null,
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

    // Create VCS client. accessToken is already decrypted in loadRepositoryContext.
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

    // Store for later use by fetchAnalysisFiles. Typed private fields so
    // downstream null-checks aren't optional.
    this.vcsOwner = owner;
    this.vcsRepo = repo;
  }

  // Fetch files for analysis
  private async fetchAnalysisFiles(): Promise<Map<string, string>> {
    if (!this.vcsClient) {
      throw new Error("VCS client not initialized");
    }
    if (!this.vcsOwner || !this.vcsRepo) {
      throw new Error("VCS owner/repo not resolved (call initializeVCSClient first)");
    }

    const owner = this.vcsOwner;
    const repo = this.vcsRepo;
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

    // Phase 1.3: route file content through a bounded RepoFileCache so a
    // pathological monorepo cannot OOM the worker. The cache silently
    // rejects files past `maxFileBytes` (default 1 MB) and stops
    // accepting once total bytes exceed `maxBytes` (default 256 MB).
    // The Map shape returned here matches the previous contract — agents
    // still call `context.fileContents.get(path)` synchronously.
    const fetched = await this.vcsClient.getMultipleFiles(owner, repo, branch, uniquePaths);
    const cache = new RepoFileCache();
    let skipped = 0;
    for (const [path, content] of fetched) {
      if (!cache.set(path, content)) skipped++;
    }
    if (skipped > 0) {
      orchLog.warn(
        { skipped, bytes: cache.bytes(), files: cache.size() },
        "skipped files past memory budget"
      );
    }
    return cache.toMap();
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

  // Save results to database.
  //
  // Phase 6: previously each agent's save method ran its own awaits, then a
  // separate `db.repository.update` at the bottom set `lastAnalyzedAt`. A
  // partial failure (network blip mid-loop) left an inconsistent state. We
  // now wrap the whole post-analysis write in a single transaction; SQLite
  // serialises writers anyway, but the atomicity guarantee matters.
  //
  // The repository row was being updated 2-3 times (languages, frameworks,
  // lastAnalyzedAt) — merged into one update at the end.
  private async saveResults(): Promise<void> {
    const techRadar = this.results.find((r) => r.agentType === "tech-radar");
    const techRadarData = techRadar?.status === "success" ? (techRadar.data as TechRadarSavePayload | undefined) : undefined;

    await db.$transaction(async (tx) => {
      for (const result of this.results) {
        if (result.status !== "success" || !result.data) continue;
        switch (result.agentType) {
          case "tech-radar":
            await this.saveTechRadarResults(tx, result.data as TechRadarSavePayload);
            break;
          case "c4":
            await this.saveC4Results(tx, result.data as C4SavePayload);
            break;
          case "adr":
            await this.saveADRResults(tx, result.data as ADRSavePayload);
            break;
          case "openapi":
            await this.saveOpenAPIResults(tx, result.data as OpenAPISavePayload);
            break;
        }
      }

      // Single repository update at the end folding in languages, frameworks,
      // and lastAnalyzedAt. Languages are merged with whatever the row already
      // had so we don't lose previously-detected entries.
      const mergedLanguages = techRadarData?.languages?.length
        ? [...new Set([...parseLanguages({ languages: this.repository?.languages ?? null }), ...techRadarData.languages])]
        : null;
      const frameworks = techRadarData?.frameworks?.length ? techRadarData.frameworks : null;

      await tx.repository.update({
        where: { id: this.config.repositoryId },
        data: {
          lastAnalyzedAt: new Date(),
          ...(mergedLanguages ? { languages: JSON.stringify(mergedLanguages) } : {}),
          ...(frameworks ? { frameworks: JSON.stringify(frameworks) } : {}),
        },
      });
    });
  }

  // Create a new `Document` row at the next available `version` for the
  // (repositoryId, type) pair. Phase 6 replaces the previous upsert which
  // overwrote prior versions; analysis history is now append-only.
  private async appendDocumentVersion(
    tx: PrismaTx,
    args: { type: DocumentType; title: string; content: string; generatedBy: string }
  ): Promise<void> {
    const latest = await tx.document.findFirst({
      where: { repositoryId: this.config.repositoryId, type: args.type },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;
    await tx.document.create({
      data: {
        repositoryId: this.config.repositoryId,
        type: args.type,
        status: "COMPLETED",
        title: args.title,
        content: args.content,
        version: nextVersion,
        generatedAt: new Date(),
        generatedBy: args.generatedBy,
      },
    });
  }

  // Save Tech Radar results
  private async saveTechRadarResults(tx: PrismaTx, data: TechRadarSavePayload): Promise<void> {
    if (!data.technologies) return;

    const quadrantMap: Record<string, "TECHNIQUES" | "TOOLS" | "PLATFORMS" | "LANGUAGES_FRAMEWORKS"> = {
      techniques: "TECHNIQUES",
      tools: "TOOLS",
      platforms: "PLATFORMS",
      "languages-frameworks": "LANGUAGES_FRAMEWORKS",
    };

    const ringMap: Record<string, "ADOPT" | "TRIAL" | "ASSESS" | "HOLD"> = {
      adopt: "ADOPT",
      trial: "TRIAL",
      assess: "ASSESS",
      hold: "HOLD",
    };

    for (const tech of data.technologies) {
      let technology = await tx.technology.findUnique({ where: { name: tech.name } });
      if (!technology) {
        technology = await tx.technology.create({
          data: {
            name: tech.name,
            category: tech.category || "Unknown",
            description: tech.description || null,
          },
        });
      }

      await tx.technologyUsage.upsert({
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

      await tx.radarItem.upsert({
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
    // languages/frameworks are merged into the single repository update at
    // the end of saveResults (Phase 6).
  }

  // Save C4 results
  private async saveC4Results(tx: PrismaTx, c4Data: C4SavePayload): Promise<void> {
    const repoName = this.repository?.name || "Repository";

    if (c4Data.level1) {
      await this.appendDocumentVersion(tx, {
        type: "C4_CONTEXT",
        title: `${repoName} - System Context`,
        content: JSON.stringify(c4Data.level1, null, 2),
        generatedBy: "c4-agent",
      });
    }
    if (c4Data.level2) {
      await this.appendDocumentVersion(tx, {
        type: "C4_CONTAINER",
        title: `${repoName} - Containers`,
        content: JSON.stringify(c4Data.level2, null, 2),
        generatedBy: "c4-agent",
      });
    }
  }

  // Save ADR results
  private async saveADRResults(tx: PrismaTx, adrData: ADRSavePayload): Promise<void> {
    if (!adrData.existingADRs) return;

    const statusMap: Record<string, "PROPOSED" | "ACCEPTED" | "DEPRECATED" | "SUPERSEDED" | "REJECTED"> = {
      proposed: "PROPOSED",
      accepted: "ACCEPTED",
      deprecated: "DEPRECATED",
      superseded: "SUPERSEDED",
      rejected: "REJECTED",
    };

    for (const adr of adrData.existingADRs) {
      await tx.aDR.upsert({
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
  private async saveOpenAPIResults(tx: PrismaTx, openApiData: OpenAPISavePayload): Promise<void> {
    const repoName = this.repository?.name || "Repository";

    if (openApiData.openapiSpec) {
      await this.appendDocumentVersion(tx, {
        type: "OPENAPI",
        title: `${repoName} - API Specification`,
        content: openApiData.openapiSpec,
        generatedBy: "openapi-agent",
      });
    }
  }

  // Update analysis run status
  private async updateAnalysisRun(status: "COMPLETED" | "FAILED", error?: string): Promise<void> {
    analysisRunsTotal.labels(status.toLowerCase()).inc();
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
// Run Analysis Helper — single entry point for starting an analysis.
//
// Phase 7: previously POST /api/repositories/[id]/analysis re-implemented
// this logic inline (duplicate paths → divergence risk). The route now
// delegates here. We also fix the TOCTOU race where two concurrent POSTs
// could create two RUNNING rows: the "is anyone running?" check + create
// happen inside one `db.$transaction`, so SQLite's BEGIN IMMEDIATE
// serialises writers and the second caller sees the first row.
// ============================================

export class AnalysisAlreadyRunningError extends Error {
  constructor(public readonly existingRunId: string) {
    super("An analysis is already running for this repository");
    this.name = "AnalysisAlreadyRunningError";
  }
}

// Hard wall-clock ceiling for a single analysis. Past this we mark the run
// FAILED and emit a WS error so the UI can recover.
const HARD_WALL_CLOCK_MS = 15 * 60 * 1000;

export type RunAnalysisOptions = {
  repositoryId: string;
  triggeredBy?: "manual" | "scheduler" | "webhook";
  enabledAgents?: AgentType[];
  onProgress?: (msg: WSProgressMessage) => void;
  onComplete?: (msg: WSAnalysisCompleteMessage) => void;
};

export async function runAnalysis(
  opts: RunAnalysisOptions
): Promise<{ analysisRunId: string }> {
  const { repositoryId, triggeredBy = "manual", enabledAgents, onProgress, onComplete } = opts;

  // Transactional create — serialises with any concurrent caller on SQLite.
  const analysisRun = await db.$transaction(async (tx) => {
    const running = await tx.analysisRun.findFirst({
      where: { repositoryId, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (running) throw new AnalysisAlreadyRunningError(running.id);

    return tx.analysisRun.create({
      data: {
        repositoryId,
        triggeredBy,
        status: "RUNNING",
        startedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
    });
  });

  const orchestrator = new AgentOrchestrator({
    analysisRunId: analysisRun.id,
    repositoryId,
    triggeredBy,
    enabledAgents,
  });
  if (onProgress || onComplete) {
    orchestrator.setCallbacks(
      onProgress ?? (() => {}),
      onComplete ?? (() => {})
    );
  }

  // Hard wall-clock guard runs in parallel with execute(); whichever resolves
  // first wins. The guard marks the row FAILED and emits onComplete so the
  // UI doesn't hang waiting for a progress event that will never come.
  const wallClock = new Promise<void>((resolve) => {
    setTimeout(async () => {
      try {
        const row = await db.analysisRun.findUnique({
          where: { id: analysisRun.id },
          select: { status: true },
        });
        if (row && (row.status === "RUNNING" || row.status === "QUEUED")) {
          await db.analysisRun.update({
            where: { id: analysisRun.id },
            data: {
              status: "FAILED",
              completedAt: new Date(),
              errors: JSON.stringify([`Hard timeout after ${HARD_WALL_CLOCK_MS / 1000}s`]),
            },
          });
          onComplete?.({
            analysisRunId: analysisRun.id,
            repositoryId,
            status: "failed",
            results: [],
            duration: HARD_WALL_CLOCK_MS,
            documentsGenerated: 0,
          });
        }
      } catch (err) {
        console.warn("wall-clock guard error:", err);
      }
      resolve();
    }, HARD_WALL_CLOCK_MS);
  });

  // Fire-and-forget. The wallClock guard + orchestrator's own try/finally
  // handle every error path; this race only ensures one of them wins.
  void Promise.race([
    orchestrator.execute().catch(async (error: unknown) => {
      console.error("Analysis failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      await db.analysisRun.update({
        where: { id: analysisRun.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errors: JSON.stringify([message]),
        },
      });
      onComplete?.({
        analysisRunId: analysisRun.id,
        repositoryId,
        status: "failed",
        results: [],
        duration: 0,
        documentsGenerated: 0,
      });
    }),
    wallClock,
  ]);

  return { analysisRunId: analysisRun.id };
}
