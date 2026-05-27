// Admin LLM usage API.
//
// Polish P1.8. Returns three aggregates the UI tabs split:
//   - byProvider: { provider, model, promptTokens, completionTokens, totalTokens, costUsd | null }
//   - byRepository: { repositoryId, repositoryName, totalTokens, costUsd | null }
//   - byRun: latest 50 runs with their LLM totals.
//
// Tenant-scoped via Repository join (LLMUsage rows themselves carry no
// tenantId — the parent run / repository does).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/tenant";
import { mapErrorToResponse } from "@/lib/api-errors";
import { costUsd } from "@/lib/llm/pricing";

export async function GET(request: NextRequest) {
  const ctx = await requireAdmin(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    // Tenant-scope by joining via repositoryId. We do the filter in
    // application code because the LLMUsage table has no tenantId column;
    // first build the set of repo ids the tenant owns.
    const repos = await db.repository.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    const repoIds = repos.map((r) => r.id);
    const repoNameById = new Map(repos.map((r) => [r.id, r.name]));

    const rows = await db.lLMUsage.findMany({
      where: {
        OR: [
          { repositoryId: { in: repoIds } },
          // Calls without a repositoryId likely came from ai-generate (ADR
          // generator) — only surface them when no analysisRunId either.
          // We omit them entirely from the tenant-scoped view to avoid
          // cross-tenant bleed.
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    // Aggregate by (provider, model).
    type Agg = { provider: string; model: string; promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number | null };
    const byKey = new Map<string, Agg>();
    for (const r of rows) {
      const k = `${r.provider}:${r.model}`;
      const cur =
        byKey.get(k) ??
        { provider: r.provider, model: r.model, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
      cur.promptTokens += r.promptTokens;
      cur.completionTokens += r.completionTokens;
      cur.totalTokens += r.totalTokens;
      const c = costUsd(r.provider, r.model, r.promptTokens, r.completionTokens);
      if (c === null) cur.costUsd = null;
      else if (cur.costUsd !== null) cur.costUsd += c;
      byKey.set(k, cur);
    }

    // Aggregate by repositoryId.
    type RepoAgg = { repositoryId: string; repositoryName: string; totalTokens: number; costUsd: number | null };
    const byRepo = new Map<string, RepoAgg>();
    for (const r of rows) {
      if (!r.repositoryId) continue;
      const cur =
        byRepo.get(r.repositoryId) ??
        { repositoryId: r.repositoryId, repositoryName: repoNameById.get(r.repositoryId) ?? "(unknown)", totalTokens: 0, costUsd: 0 };
      cur.totalTokens += r.totalTokens;
      const c = costUsd(r.provider, r.model, r.promptTokens, r.completionTokens);
      if (c === null) cur.costUsd = null;
      else if (cur.costUsd !== null) cur.costUsd += c;
      byRepo.set(r.repositoryId, cur);
    }

    // Per-run rollup (latest 50).
    const runRows = await db.analysisRun.findMany({
      where: { repositoryId: { in: repoIds } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, repositoryId: true, status: true, createdAt: true },
    });
    const usageByRun = await db.lLMUsage.groupBy({
      by: ["analysisRunId"],
      where: { analysisRunId: { in: runRows.map((r) => r.id) } },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
    });
    const usageById = new Map(usageByRun.map((u) => [u.analysisRunId ?? "", u._sum]));
    const byRun = runRows.map((r) => ({
      runId: r.id,
      repositoryId: r.repositoryId,
      repositoryName: repoNameById.get(r.repositoryId) ?? "(unknown)",
      status: r.status,
      createdAt: r.createdAt,
      promptTokens: usageById.get(r.id)?.promptTokens ?? 0,
      completionTokens: usageById.get(r.id)?.completionTokens ?? 0,
      totalTokens: usageById.get(r.id)?.totalTokens ?? 0,
    }));

    // 7-day trend (rows by day).
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const trendRows = rows.filter((r) => r.createdAt >= since);
    const byDay = new Map<string, number>();
    for (const r of trendRows) {
      const key = r.createdAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + r.totalTokens);
    }
    const trend = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, tokens]) => ({ day, tokens }));

    return NextResponse.json({
      byProvider: Array.from(byKey.values()),
      byRepository: Array.from(byRepo.values()),
      byRun,
      trend,
    });
  } catch (err) {
    return mapErrorToResponse(err);
  }
}
