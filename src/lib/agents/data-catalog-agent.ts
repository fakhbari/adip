// Data Catalog Agent — Phase 3.2.
//
// Walks repository files for database schema evidence:
//   - Prisma schemas (model definitions)
//   - Alembic / Django migrations (SQL CREATE TABLE)
//   - SQLAlchemy / Hibernate / JPA / TypeORM entity classes
//
// Pre-pass is intentionally lenient — we collect table names + column
// hints + relation hints and feed them to the LLM, which synthesises
// the ERD + data dictionary via prompts/data-catalog/erd.{en,fa}.md.
//
// Persistent storage: the result lands as Document(type=DATA_CATALOG)
// via the orchestrator's appendDocumentVersion path; the schema enum
// already accepts that value.

import { BaseAgent, createAgentConfig } from "./base-agent";
import { AgentResult, AnalysisContext } from "./types";
import { logger } from "@/lib/logger";
import { PromptRegistry } from "@/lib/llm/prompt-registry";

const dcLog = logger("agents.data-catalog");

type DetectedTable = { name: string; sourceFile: string; columns?: string[] };

export type DataCatalogSavePayload = {
  tables: DetectedTable[];
  catalog?: string; // Markdown produced by the LLM pass.
};

// Prisma `model Foo { ... }`
const PRISMA_MODEL_RE = /^\s*model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]*)\}/gm;
// SQL `CREATE TABLE foo (...)`
const SQL_CREATE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([\w.]+)["`]?\s*\(/gi;
// JPA / TypeORM / SQLAlchemy class with @Entity or Base
const ENTITY_CLASS_RE = /@Entity\b[\s\S]{0,200}?class\s+([A-Za-z_][A-Za-z0-9_]*)/g;

export class DataCatalogAgent extends BaseAgent {
  constructor() {
    super(createAgentConfig("data-catalog"));
  }

  async analyze(context: AnalysisContext): Promise<AgentResult> {
    const startTime = Date.now();
    const tables: DetectedTable[] = [];
    const seen = new Set<string>();

    this.updateProgress(15, "Scanning Prisma / SQL / ORM models...");

    for (const [path, content] of context.fileContents) {
      // Prisma schema
      if (path.endsWith(".prisma")) {
        let m: RegExpExecArray | null;
        const re = new RegExp(PRISMA_MODEL_RE.source, "gm");
        while ((m = re.exec(content)) !== null) {
          const name = m[1];
          if (seen.has(name)) continue;
          seen.add(name);
          const columns = [...m[2].matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s+\S/gm)]
            .map((mm) => mm[1])
            .slice(0, 30);
          tables.push({ name, sourceFile: path, columns });
        }
      }

      // SQL migrations
      if (/migration|sql$|alembic|flyway|liquibase/.test(path)) {
        let m: RegExpExecArray | null;
        const re = new RegExp(SQL_CREATE_RE.source, "gi");
        while ((m = re.exec(content)) !== null) {
          const name = m[1].split(".").pop() ?? m[1];
          if (seen.has(name)) continue;
          seen.add(name);
          tables.push({ name, sourceFile: path });
        }
      }

      // Java / Kotlin / TS entities
      if (/\.(java|kt|ts|py)$/.test(path) && content.includes("@Entity")) {
        let m: RegExpExecArray | null;
        const re = new RegExp(ENTITY_CLASS_RE.source, "g");
        while ((m = re.exec(content)) !== null) {
          const name = m[1];
          if (seen.has(name)) continue;
          seen.add(name);
          tables.push({ name, sourceFile: path });
        }
      }
    }

    this.updateProgress(70, "Building data catalog...");

    let catalog: string | undefined;
    if (context.llm && tables.length > 0) {
      try {
        const locale = context.outputLocale ?? "fa";
        const prompt = await PromptRegistry.render({
          agent: "data-catalog",
          task: "erd",
          locale,
          vars: {
            tables: tables.map((t) => `- ${t.name} (${t.sourceFile})${t.columns ? ` cols: ${t.columns.join(", ")}` : ""}`).join("\n"),
            relations: "(inferred by the LLM)",
          },
        });
        const result = await context.llm.chat(
          [{ role: "user", content: prompt }],
          { meta: { analysisRunId: context.analysisRunId, agentType: "data-catalog" } }
        );
        catalog = result.content;
      } catch (err) {
        dcLog.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "data-catalog LLM pass skipped"
        );
      }
    }

    this.filesAnalyzed = context.fileContents.size;

    return {
      agentType: "data-catalog",
      status: "success",
      data: { tables, catalog } satisfies DataCatalogSavePayload,
      duration: Date.now() - startTime,
      filesAnalyzed: this.filesAnalyzed,
    };
  }
}
