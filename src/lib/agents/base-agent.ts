// Base Agent Class for Multi-Agent Architecture

import {
  AgentType,
  AgentStatus,
  AgentResult,
  AgentProgress,
  AnalysisContext,
  FileInfo,
} from "./types";

// ============================================
// Agent Configuration
// ============================================

export interface AgentConfig {
  id: string;
  type: AgentType;
  name: string;
  description: string;
  priority: number;  // Lower = higher priority (runs first)
  timeout: number;   // Timeout in milliseconds
}

// ============================================
// Abstract Base Agent
// ============================================

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected status: AgentStatus = "idle";
  protected progress: number = 0;
  protected message: string = "";
  protected startTime: number = 0;
  protected filesAnalyzed: number = 0;
  
  // Progress callback for WebSocket notifications
  protected onProgress?: (progress: AgentProgress) => void;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  // Public accessors. Used by the orchestrator to inspect agents without
  // reaching into the protected `config` field (which previously broke
  // encapsulation and got mangled under minification).
  getType(): AgentType {
    return this.config.type;
  }

  getName(): string {
    return this.config.name;
  }

  getPriority(): number {
    return this.config.priority;
  }

  // Set progress callback
  setProgressCallback(callback: (progress: AgentProgress) => void) {
    this.onProgress = callback;
  }

  // Get current progress
  getProgress(): AgentProgress {
    return {
      agentId: this.config.id,
      agentType: this.config.type,
      status: this.status,
      progress: this.progress,
      message: this.message,
      timestamp: new Date(),
    };
  }

  // Update progress and notify
  protected updateProgress(progress: number, message: string) {
    this.progress = Math.min(100, Math.max(0, progress));
    this.message = message;
    
    if (this.onProgress) {
      this.onProgress(this.getProgress());
    }
  }

  // Set status
  protected setStatus(status: AgentStatus) {
    this.status = status;
  }

  // Analyze repository - to be implemented by each agent
  abstract analyze(context: AnalysisContext): Promise<AgentResult>;

  // Main execution method
  async execute(context: AnalysisContext): Promise<AgentResult> {
    this.startTime = Date.now();
    this.status = "running";
    this.progress = 0;
    this.filesAnalyzed = 0;

    try {
      this.updateProgress(0, `Starting ${this.config.name}...`);
      
      // Run the analysis with timeout
      const result = await this.executeWithTimeout(context);
      
      this.status = "completed";
      this.progress = 100;
      this.updateProgress(100, `${this.config.name} completed successfully`);
      
      return result;
    } catch (error) {
      this.status = "failed";
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.updateProgress(0, `${this.config.name} failed: ${errorMessage}`);
      
      return {
        agentType: this.config.type,
        status: "failed",
        error: errorMessage,
        duration: Date.now() - this.startTime,
        filesAnalyzed: this.filesAnalyzed,
      };
    }
  }

  // Execute with timeout.
  //
  // Previously this used `new Promise(async (resolve, reject) => …)` — an
  // async-executor anti-pattern that could double-resolve if `analyze()`
  // settled after the timeout had already fired. The rewrite races a
  // setTimeout-rejection against `analyze()` and clears the timer in a
  // `finally` block, guaranteeing exactly one settle.
  private async executeWithTimeout(context: AnalysisContext): Promise<AgentResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Agent ${this.config.name} timed out after ${this.config.timeout}ms`)),
        this.config.timeout
      );
    });

    try {
      return await Promise.race([this.analyze(context), timeoutPromise]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  // Helper: Get file content from context
  protected getFileContent(context: AnalysisContext, path: string): string | null {
    return context.fileContents.get(path) || null;
  }

  // Helper: Get files matching pattern
  protected getMatchingFiles(context: AnalysisContext, patterns: RegExp[]): FileInfo[] {
    return context.fileTree.filter(file => 
      file.type === "file" && 
      patterns.some(pattern => pattern.test(file.path))
    );
  }

  // Helper: Check if file exists
  protected fileExists(context: AnalysisContext, path: string): boolean {
    return context.fileTree.some(f => f.path === path && f.type === "file");
  }

  // Helper: Read multiple files
  protected async readFiles(
    context: AnalysisContext, 
    paths: string[]
  ): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    
    for (const path of paths) {
      const content = this.getFileContent(context, path);
      if (content) {
        contents.set(path, content);
        this.filesAnalyzed++;
      }
    }
    
    return contents;
  }
}

// ============================================
// Agent Factory Helper
// ============================================

export function createAgentConfig(
  type: AgentType, 
  overrides?: Partial<AgentConfig>
): AgentConfig {
  const defaults: Record<AgentType, Omit<AgentConfig, "id">> = {
    "tech-radar": {
      type: "tech-radar",
      name: "Technology Radar Agent",
      description: "Detects technologies, languages, and frameworks used in the repository",
      priority: 1,
      timeout: 120000,  // 2 minutes
    },
    "c4": {
      type: "c4",
      name: "C4 Model Agent",
      description: "Extracts C4 architecture model from codebase structure",
      priority: 2,
      timeout: 180000,  // 3 minutes
    },
    "adr": {
      type: "adr",
      name: "ADR Agent",
      description: "Detects existing ADRs and suggests new ones based on code patterns",
      priority: 3,
      timeout: 180000,  // 3 minutes
    },
    "openapi": {
      type: "openapi",
      name: "OpenAPI Agent",
      description: "Extracts API endpoints and generates OpenAPI specification",
      priority: 4,
      timeout: 180000,  // 3 minutes
    },
    "asyncapi": {
      type: "asyncapi",
      name: "AsyncAPI Agent",
      description: "Detects event-driven patterns and generates AsyncAPI specification",
      priority: 5,
      timeout: 180000,  // 3 minutes
    },
  };

  const base = defaults[type];
  return {
    id: `agent-${type}-${Date.now()}`,
    ...base,
    ...overrides,
  };
}
