"use client";

// Run detail view — Polish P1.5.
//
// Tabs: Overview / Agents / Events / LLM Calls / Errors / Documents.
// Pulls from /api/repositories/[id]/runs/[runId] which joins the
// AnalysisRun + RunEvent timeline + LLMUsage rows + Documents generated
// in the run window.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Eye } from "lucide-react";
import { apiFetch, showApiError } from "@/lib/api-client";

type Run = {
  id: string;
  status: string;
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  documentsGenerated: number | null;
  errors: string | null;
  createdAt: string;
};
type Event = {
  id: string;
  type: string;
  agentType: string | null;
  content: string | null;
  role: string | null;
  ts: string;
};
type Usage = {
  id: string;
  provider: string;
  model: string;
  agentType: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  createdAt: string;
};
type Document = {
  id: string;
  type: string;
  title: string;
  version: number;
  status: string;
  generatedAt: string | null;
  generatedBy: string | null;
};
type ApiShape = { run: Run; events: Event[]; usage: Usage[]; documents: Document[] };

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "COMPLETED" ? "default" :
    status === "FAILED" || status === "CANCELLED" ? "destructive" :
    status === "RUNNING" || status === "QUEUED" ? "secondary" :
    "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export function RunDetailView({ repositoryId, runId }: { repositoryId: string; runId: string }) {
  const [data, setData] = useState<ApiShape | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<ApiShape>(`/api/repositories/${repositoryId}/runs/${runId}`);
    if ("data" in res) setData(res.data);
    else showApiError(res);
    setLoading(false);
  }, [repositoryId, runId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // Pre-derive per-agent rollup from events.
  const agentRollup = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { agentType: string; start: string | null; end: string | null; status: string; error?: string; durationMs?: number }>();
    for (const e of data.events) {
      if (!e.agentType) continue;
      const cur = map.get(e.agentType) ?? { agentType: e.agentType, start: null, end: null, status: "running" };
      if (e.type === "agent-start") cur.start = e.ts;
      if (e.type === "agent-end") {
        cur.end = e.ts;
        cur.status = "success";
      }
      if (e.type === "agent-failed") {
        cur.end = e.ts;
        cur.status = "failed";
        if (e.content) {
          try {
            const parsed = JSON.parse(e.content) as { error?: string };
            cur.error = parsed.error;
          } catch {
            cur.error = e.content;
          }
        }
      }
      if (cur.start && cur.end) {
        cur.durationMs = new Date(cur.end).getTime() - new Date(cur.start).getTime();
      }
      map.set(e.agentType, cur);
    }
    return Array.from(map.values());
  }, [data]);

  const llmEvents = useMemo(() => data?.events.filter((e) => e.type.startsWith("llm-")) ?? [], [data]);
  const failureEvents = useMemo(
    () => data?.events.filter((e) => e.type === "agent-failed" || e.type === "run-failed") ?? [],
    [data]
  );

  if (loading || !data) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { run } = data;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analysis run</h1>
          <p className="text-sm text-muted-foreground">
            {run.id} ·{" "}
            <Link href={`/repositories/${repositoryId}/runs`} className="text-primary hover:underline">
              all runs
            </Link>
            {" · "}
            <Link
              href={`/repositories/${repositoryId}/runs/${runId}/live`}
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              <Eye className="h-3 w-3" /> live log
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={run.status} />
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agents">Agents ({agentRollup.length})</TabsTrigger>
          <TabsTrigger value="events">Events ({data.events.length})</TabsTrigger>
          <TabsTrigger value="llm">LLM Calls ({data.usage.length})</TabsTrigger>
          <TabsTrigger value="errors">Errors ({failureEvents.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({data.documents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Triggered by {run.triggeredBy}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
              <div><span className="text-muted-foreground">Started:</span> {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</div>
              <div><span className="text-muted-foreground">Completed:</span> {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}</div>
              <div><span className="text-muted-foreground">Duration:</span> {run.duration ? `${run.duration}s` : "—"}</div>
              <div><span className="text-muted-foreground">Docs generated:</span> {run.documentsGenerated ?? "—"}</div>
              <div><span className="text-muted-foreground">Total LLM tokens:</span> {data.usage.reduce((a, u) => a + u.totalTokens, 0).toLocaleString()}</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agents">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 px-4">Agent</th>
                    <th className="py-2 px-4">Status</th>
                    <th className="py-2 px-4">Duration</th>
                    <th className="py-2 px-4">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {agentRollup.map((a) => (
                    <tr key={a.agentType} className="border-b last:border-b-0">
                      <td className="py-2 px-4 font-medium">{a.agentType}</td>
                      <td className="py-2 px-4">
                        <Badge variant={a.status === "success" ? "default" : a.status === "failed" ? "destructive" : "secondary"}>
                          {a.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-4">{a.durationMs ? `${(a.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                      <td className="py-2 px-4 max-w-md truncate text-muted-foreground" title={a.error ?? ""}>{a.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardContent className="p-4 max-h-[600px] overflow-auto font-mono text-xs">
              {data.events.map((e) => (
                <div key={e.id} className="border-b last:border-b-0 py-1.5">
                  <span className="text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>{" "}
                  <Badge variant="outline" className="mr-2">{e.type}</Badge>
                  {e.agentType && <span className="text-muted-foreground mr-2">[{e.agentType}]</span>}
                  {e.content && <span className="whitespace-pre-wrap break-words">{e.content.slice(0, 500)}{e.content.length > 500 ? "…" : ""}</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="llm">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 px-4">When</th>
                    <th className="py-2 px-4">Provider</th>
                    <th className="py-2 px-4">Model</th>
                    <th className="py-2 px-4">Agent</th>
                    <th className="py-2 px-4">Prompt</th>
                    <th className="py-2 px-4">Completion</th>
                    <th className="py-2 px-4">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.usage.map((u) => (
                    <tr key={u.id} className="border-b last:border-b-0">
                      <td className="py-2 px-4 whitespace-nowrap">{new Date(u.createdAt).toLocaleTimeString()}</td>
                      <td className="py-2 px-4">{u.provider}</td>
                      <td className="py-2 px-4">{u.model}</td>
                      <td className="py-2 px-4">{u.agentType ?? "—"}</td>
                      <td className="py-2 px-4 text-right">{u.promptTokens.toLocaleString()}</td>
                      <td className="py-2 px-4 text-right">{u.completionTokens.toLocaleString()}</td>
                      <td className="py-2 px-4 text-right font-medium">{u.totalTokens.toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.usage.length > 0 && (
                    <tr className="font-semibold">
                      <td colSpan={4} className="py-2 px-4 text-right">Total</td>
                      <td className="py-2 px-4 text-right">{data.usage.reduce((a, u) => a + u.promptTokens, 0).toLocaleString()}</td>
                      <td className="py-2 px-4 text-right">{data.usage.reduce((a, u) => a + u.completionTokens, 0).toLocaleString()}</td>
                      <td className="py-2 px-4 text-right">{data.usage.reduce((a, u) => a + u.totalTokens, 0).toLocaleString()}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {data.usage.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No LLM usage recorded for this run.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="errors">
          <Card>
            <CardContent className="p-4 space-y-2">
              {failureEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No failures recorded.</p>
              ) : (
                failureEvents.map((e) => (
                  <div key={e.id} className="text-sm rounded border bg-destructive/10 p-3">
                    <div className="text-muted-foreground text-xs">{new Date(e.ts).toLocaleString()} · {e.type}{e.agentType ? ` · ${e.agentType}` : ""}</div>
                    {e.content && <pre className="text-xs mt-1 overflow-auto whitespace-pre-wrap">{e.content}</pre>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 px-4">Type</th>
                    <th className="py-2 px-4">Title</th>
                    <th className="py-2 px-4">Version</th>
                    <th className="py-2 px-4">Generated by</th>
                    <th className="py-2 px-4">At</th>
                  </tr>
                </thead>
                <tbody>
                  {data.documents.map((d) => (
                    <tr key={d.id} className="border-b last:border-b-0">
                      <td className="py-2 px-4"><Badge variant="outline">{d.type}</Badge></td>
                      <td className="py-2 px-4">{d.title}</td>
                      <td className="py-2 px-4">v{d.version}</td>
                      <td className="py-2 px-4">{d.generatedBy ?? "—"}</td>
                      <td className="py-2 px-4 whitespace-nowrap">{d.generatedAt ? new Date(d.generatedAt).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.documents.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No documents produced in this run.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
