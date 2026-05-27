"use client";

// LLM usage view — Polish P1.8.
//
// Four tabs:
//   By Provider — token totals + USD cost per (provider, model).
//   By Repository — totals per repo.
//   By Run — last 50 runs with their cumulative LLM totals.
//   Trend — 7-day daily token total.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { apiFetch, showApiError } from "@/lib/api-client";

type ProviderAgg = { provider: string; model: string; promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number | null };
type RepoAgg = { repositoryId: string; repositoryName: string; totalTokens: number; costUsd: number | null };
type RunAgg = { runId: string; repositoryId: string; repositoryName: string; status: string; createdAt: string; promptTokens: number; completionTokens: number; totalTokens: number };
type TrendPoint = { day: string; tokens: number };
type ApiShape = { byProvider: ProviderAgg[]; byRepository: RepoAgg[]; byRun: RunAgg[]; trend: TrendPoint[] };

function fmtCost(n: number | null): string {
  if (n === null) return "—";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function LLMUsageView() {
  const [data, setData] = useState<ApiShape | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<ApiShape>("/api/admin/usage");
    if ("data" in res) setData(res.data);
    else showApiError(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const maxTrend = data?.trend.reduce((m, p) => Math.max(m, p.tokens), 0) ?? 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">LLM usage</h1>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="provider">
        <TabsList>
          <TabsTrigger value="provider">By Provider</TabsTrigger>
          <TabsTrigger value="repo">By Repository</TabsTrigger>
          <TabsTrigger value="run">By Run</TabsTrigger>
          <TabsTrigger value="trend">Trend (7d)</TabsTrigger>
        </TabsList>

        <TabsContent value="provider">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 px-4">Provider</th>
                    <th className="py-2 px-4">Model</th>
                    <th className="py-2 px-4 text-right">Prompt</th>
                    <th className="py-2 px-4 text-right">Completion</th>
                    <th className="py-2 px-4 text-right">Total</th>
                    <th className="py-2 px-4 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.byProvider.map((r) => (
                    <tr key={`${r.provider}:${r.model}`} className="border-b last:border-b-0">
                      <td className="py-2 px-4"><Badge variant="outline">{r.provider}</Badge></td>
                      <td className="py-2 px-4 font-mono text-xs">{r.model}</td>
                      <td className="py-2 px-4 text-right">{r.promptTokens.toLocaleString()}</td>
                      <td className="py-2 px-4 text-right">{r.completionTokens.toLocaleString()}</td>
                      <td className="py-2 px-4 text-right font-medium">{r.totalTokens.toLocaleString()}</td>
                      <td className="py-2 px-4 text-right">{fmtCost(r.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && data.byProvider.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No LLM usage recorded yet.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="repo">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 px-4">Repository</th>
                    <th className="py-2 px-4 text-right">Total tokens</th>
                    <th className="py-2 px-4 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.byRepository.map((r) => (
                    <tr key={r.repositoryId} className="border-b last:border-b-0">
                      <td className="py-2 px-4">{r.repositoryName}</td>
                      <td className="py-2 px-4 text-right">{r.totalTokens.toLocaleString()}</td>
                      <td className="py-2 px-4 text-right">{fmtCost(r.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && data.byRepository.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No LLM usage attributed to repositories.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="run">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 px-4">Started</th>
                    <th className="py-2 px-4">Repository</th>
                    <th className="py-2 px-4">Status</th>
                    <th className="py-2 px-4 text-right">Prompt</th>
                    <th className="py-2 px-4 text-right">Completion</th>
                    <th className="py-2 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.byRun.map((r) => (
                    <tr key={r.runId} className="border-b last:border-b-0">
                      <td className="py-2 px-4 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="py-2 px-4">{r.repositoryName}</td>
                      <td className="py-2 px-4"><Badge variant="outline">{r.status}</Badge></td>
                      <td className="py-2 px-4 text-right">{r.promptTokens.toLocaleString()}</td>
                      <td className="py-2 px-4 text-right">{r.completionTokens.toLocaleString()}</td>
                      <td className="py-2 px-4 text-right font-medium">{r.totalTokens.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trend">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Tokens per day</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data?.trend.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No usage in the last 7 days.</p>
              ) : (
                data?.trend.map((p) => (
                  <div key={p.day} className="flex items-center gap-3 text-sm">
                    <span className="w-24 text-muted-foreground">{p.day}</span>
                    <div className="flex-1 bg-muted/40 rounded h-3 overflow-hidden">
                      <div
                        className="bg-primary h-full"
                        style={{ width: `${maxTrend === 0 ? 0 : (p.tokens / maxTrend) * 100}%` }}
                      />
                    </div>
                    <span className="w-24 text-right">{p.tokens.toLocaleString()}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
