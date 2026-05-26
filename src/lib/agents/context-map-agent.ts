// Context Map Agent — Phase 3.3.
//
// DDD bounded-context detection. Heuristics:
//   - Top-level service directories in a monorepo (apps/* services/*
//     packages/* or any dir with its own package.json / pom.xml).
//   - Cross-context signals from shared event/message names, schema
//     imports, HTTP client base URLs.
//
// The pre-pass surfaces the candidate context list + signals; the LLM
// pass classifies relationships into the DDD pattern vocabulary
// (OHS, ACL, Conformist, Partnership, Shared Kernel, Customer-Supplier,
// Separate Ways) via prompts/context-map/map.{en,fa}.md.

import { BaseAgent, createAgentConfig } from "./base-agent";
import { AgentResult, AnalysisContext } from "./types";
import { logger } from "@/lib/logger";
import { PromptRegistry } from "@/lib/llm/prompt-registry";

const cmLog = logger("agents.context-map");

type Context = { name: string; rootDir: string };
type Signal = { type: "event" | "http" | "import"; from: string; to?: string; payload: string };

export type ContextMapSavePayload = {
  contexts: Context[];
  signals: Signal[];
  mapMarkdown?: string; // Markdown produced by the LLM pass.
};

const SERVICE_INDICATORS = ["package.json", "pom.xml", "go.mod", "Cargo.toml", "build.gradle"];

export class ContextMapAgent extends BaseAgent {
  constructor() {
    super(createAgentConfig("context-map"));
  }

  async analyze(context: AnalysisContext): Promise<AgentResult> {
    const startTime = Date.now();
    const contexts: Context[] = [];
    const signals: Signal[] = [];

    this.updateProgress(15, "Locating bounded contexts...");

    // Group files by their top-level directory; a top-level dir
    // containing a package manifest is treated as a context.
    const dirsWithManifest = new Set<string>();
    for (const path of context.fileContents.keys()) {
      const parts = path.split("/");
      if (parts.length >= 2 && SERVICE_INDICATORS.some((m) => parts[parts.length - 1] === m)) {
        // Take the deepest directory containing the manifest as the context root.
        dirsWithManifest.add(parts.slice(0, -1).join("/"));
      }
    }

    if (dirsWithManifest.size === 0) {
      // Single-context repository.
      contexts.push({ name: context.repository.name, rootDir: "." });
    } else {
      for (const root of dirsWithManifest) {
        const name = root.split("/").pop() ?? root;
        contexts.push({ name, rootDir: root });
      }
    }

    this.updateProgress(45, "Collecting cross-context signals...");

    // Cheap signal sweep: HTTP client base URLs + Kafka topics that
    // suggest cross-context calls. The LLM pass turns these into
    // pattern-typed relationships.
    const HTTP_BASE_RE = /(https?:\/\/[a-z0-9.-]+(?:\:\d+)?(?:\/[\w\-./]*)?)/gi;
    for (const [path, content] of context.fileContents) {
      const from = contexts.find((c) => path.startsWith(c.rootDir + "/"))?.name ?? "root";
      let m: RegExpExecArray | null;
      const re = new RegExp(HTTP_BASE_RE.source, "gi");
      let i = 0;
      while ((m = re.exec(content)) !== null && i++ < 5) {
        signals.push({ type: "http", from, payload: m[1] });
      }
    }

    this.updateProgress(75, "Building context map...");

    let mapMarkdown: string | undefined;
    if (context.llm && contexts.length > 0) {
      try {
        const locale = context.outputLocale ?? "fa";
        const prompt = await PromptRegistry.render({
          agent: "context-map",
          task: "map",
          locale,
          vars: {
            contexts: contexts.map((c) => `- ${c.name} (${c.rootDir})`).join("\n"),
            signals: signals.slice(0, 80).map((s) => `- ${s.type} from ${s.from}: ${s.payload}`).join("\n"),
          },
        });
        const result = await context.llm.chat(
          [{ role: "user", content: prompt }],
          { meta: { analysisRunId: context.analysisRunId, agentType: "context-map" } }
        );
        mapMarkdown = result.content;
      } catch (err) {
        cmLog.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "context-map LLM pass skipped"
        );
      }
    }

    this.filesAnalyzed = context.fileContents.size;

    return {
      agentType: "context-map",
      status: "success",
      data: { contexts, signals, mapMarkdown } satisfies ContextMapSavePayload,
      duration: Date.now() - startTime,
      filesAnalyzed: this.filesAnalyzed,
    };
  }
}
