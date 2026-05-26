import { db } from "@/lib/db";
import { llmTokensTotal } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import type { TokenUsage } from "./types";

const log = logger("llm.usage");

/**
 * Record a single LLM call into both the Prometheus counter and the
 * LLMUsage table. Best-effort: a DB failure never propagates into the
 * caller (we do not want a stats failure to fail an analysis).
 */
export async function recordUsage(args: {
  provider: string;
  model: string;
  usage: TokenUsage;
  analysisRunId?: string;
  repositoryId?: string;
  agentType?: string;
}): Promise<void> {
  // Metrics: increment counters tagged with provider/model/direction.
  llmTokensTotal.labels(args.provider, args.model, "prompt").inc(args.usage.promptTokens);
  llmTokensTotal.labels(args.provider, args.model, "completion").inc(args.usage.completionTokens);

  // DB row (Phase 2.1's LLMUsage table). Schema is added alongside this file.
  try {
    await db.lLMUsage.create({
      data: {
        provider: args.provider,
        model: args.model,
        promptTokens: args.usage.promptTokens,
        completionTokens: args.usage.completionTokens,
        totalTokens: args.usage.totalTokens,
        analysisRunId: args.analysisRunId,
        repositoryId: args.repositoryId,
        agentType: args.agentType,
      },
    });
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, "usage write failed");
  }
}
