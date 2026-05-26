// Agent Types for Multi-Agent Architecture

import { AIProvider, Repository, RepositoryConnection } from "@prisma/client";
import type { LLMProvider } from "@/lib/llm";

// ============================================
// Core Types
// ============================================

export type AgentType =
  | "tech-radar"
  | "c4"
  | "adr"
  | "openapi"
  | "asyncapi"
  // Phase 3.2 / 3.3 — new agent kinds.
  | "data-catalog"
  | "context-map";

export type AgentStatus = 
  | "idle" 
  | "running" 
  | "completed" 
  | "failed";

export type AnalysisStatus = 
  | "queued" 
  | "running" 
  | "completed" 
  | "failed" 
  | "cancelled";

// ============================================
// Context & Input Types
// ============================================

export interface RepositoryContext {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  languages?: string | null;
  frameworks?: string | null;
  defaultBranch: string;
  lastCommitHash?: string | null;
  repositoryPath?: string | null;
  repositoryUrl?: string | null;
  connection?: RepositoryConnection | null;
  aiProvider?: AIProvider | null;
}

export interface AnalysisContext {
  repository: RepositoryContext;
  analysisRunId: string;
  triggeredBy: "manual" | "scheduler" | "webhook";
  aiProvider: AIProvider;
  fileContents: Map<string, string>;  // Cached file contents
  fileTree: FileInfo[];               // Repository file tree
  // Phase 1.4 — populated when this is an incremental analysis. Agents
  // can inspect the set to decide whether their output is still valid
  // (skip if their inputs are unchanged). Undefined for full scans.
  incrementalScope?: Set<string>;
  // The commit SHA we are analysing, useful for snapshot writeback.
  currentSha?: string;
  // Phase 2.5 — LLMProvider instance built from `aiProvider`. Agents
  // call `context.llm.chat(...)` (via runWithSchema) for the AI pass
  // that augments their regex output. Undefined when no AIProvider is
  // configured — agents fall back to regex-only output.
  llm?: LLMProvider;
  // The repository's preferred output locale (default "fa").
  outputLocale?: "en" | "fa";
}

export interface FileInfo {
  path: string;
  type: "file" | "directory";
  size?: number;
  sha?: string;
}

// ============================================
// Agent Result Types
// ============================================

export interface AgentProgress {
  agentId: string;
  agentType: AgentType;
  status: AgentStatus;
  progress: number;  // 0-100
  message: string;
  timestamp: Date;
}

export interface AgentResult {
  agentType: AgentType;
  status: "success" | "failed" | "skipped";
  data?: unknown;
  error?: string;
  duration: number;  // in milliseconds
  filesAnalyzed: number;
}

// ============================================
// Tech Radar Types
// ============================================

export interface DetectedTechnology {
  name: string;
  category: string;
  version?: string;
  sourceFile: string;
  description?: string;
  quadrant: "techniques" | "tools" | "platforms" | "languages-frameworks";
  ring: "adopt" | "trial" | "assess" | "hold";
  confidence: number;  // 0-1
}

export interface TechRadarResult {
  technologies: DetectedTechnology[];
  languages: string[];
  frameworks: string[];
}

// ============================================
// C4 Model Types
// ============================================

export interface C4System {
  name: string;
  description: string;
  type: "internal" | "external";
}

export interface C4Person {
  name: string;
  description: string;
  type: "user" | "developer" | "admin" | "external";
}

export interface C4Container {
  name: string;
  description: string;
  type: "web-app" | "mobile-app" | "api" | "database" | "queue" | "cache" | "filesystem" | "service";
  technology: string;
}

export interface C4Component {
  name: string;
  description: string;
  technology: string;
  container: string;
}

export interface C4Relationship {
  source: string;
  target: string;
  description: string;
  technology?: string;
}

export interface C4Level1 {
  system: C4System;
  persons: C4Person[];
  externalSystems: C4System[];
  relationships: C4Relationship[];
}

export interface C4Level2 {
  containers: C4Container[];
  relationships: C4Relationship[];
}

export interface C4Result {
  level1: C4Level1;
  level2: C4Level2;
  confidence: number;
}

// ============================================
// ADR Types
// ============================================

export interface DetectedADR {
  number: number;
  title: string;
  status: "proposed" | "accepted" | "deprecated" | "superseded" | "rejected";
  context: string;
  decision: string;
  consequences?: string;
  alternatives?: string;
  source: "existing" | "generated";
  filePath?: string;
  relatedCommits?: string[];
  triggers?: string[];
}

export interface ADRSuggestion {
  title: string;
  rationale: string;
  relatedFiles: string[];
  priority: "high" | "medium" | "low";
}

export interface ADRResult {
  existingADRs: DetectedADR[];
  suggestedADRs: ADRSuggestion[];
}

// ============================================
// OpenAPI Types
// ============================================

export interface DetectedEndpoint {
  path: string;
  method: string;
  description?: string;
  controller?: string;
  handler?: string;
}

export interface DetectedSchema {
  name: string;
  type: string;
  properties: Record<string, { type: string; description?: string }>;
}

export interface OpenAPIResult {
  endpoints: DetectedEndpoint[];
  schemas: DetectedSchema[];
  openapiSpec?: string;  // Full OpenAPI YAML/JSON
  confidence: number;
}

// ============================================
// WebSocket Message Types
// ============================================

export interface WSMessage {
  type: "progress" | "agent_complete" | "analysis_complete" | "error";
  payload: unknown;
  timestamp: Date;
}

export interface WSProgressMessage {
  analysisRunId: string;
  repositoryId: string;
  progress: AgentProgress;
}

export interface WSAnalysisCompleteMessage {
  analysisRunId: string;
  repositoryId: string;
  status: AnalysisStatus;
  results: AgentResult[];
  duration: number;
  documentsGenerated: number;
}

export interface WSErrorMessage {
  analysisRunId: string;
  repositoryId: string;
  error: string;
  agentType?: AgentType;
}
