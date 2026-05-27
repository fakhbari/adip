"use client";

// Live log view — Polish P2.6.
//
// The user complaint "no log-view when analysing with AI" lands here.
// Subscribes to:
//   - analysis-progress  → overall % + agent label
//   - agent-event        → start / end / failed per agent
//   - llm-delta          → token-level stream from observed provider
// Plus polls /api/repositories/[id]/runs/[runId] every 2s as a safety
// net when the WS connection is down (no panic refresh — the page can
// still finish its life cycle from REST).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, RefreshCw, Radio } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

type Run = { id: string; status: string; documentsGenerated: number | null; completedAt: string | null };
type Event = { id: string; type: string; agentType: string | null; content: string | null; ts: string };
type ApiShape = { run: Run; events: Event[] };

type AgentTick = { agentType: string; status: "running" | "success" | "failed"; ts: number };

export function LiveLogView({ repositoryId, runId }: { repositoryId: string; runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [progress, setProgress] = useState<{ percent: number; agentType?: string; message?: string }>({ percent: 0 });
  const [agentTicks, setAgentTicks] = useState<AgentTick[]>([]);
  const [llmText, setLlmText] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const llmRef = useRef<HTMLDivElement>(null);
  const eventsRef = useRef<HTMLDivElement>(null);

  // REST baseline / fallback.
  const refresh = useCallback(async () => {
    const res = await apiFetch<ApiShape>(`/api/repositories/${repositoryId}/runs/${runId}`);
    if ("data" in res) {
      setRun(res.data.run);
      setEvents(res.data.events);
    }
  }, [repositoryId, runId]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  // Auto-scroll log + llm panes when new content arrives.
  useEffect(() => {
    if (eventsRef.current) eventsRef.current.scrollTop = eventsRef.current.scrollHeight;
  }, [events.length]);
  useEffect(() => {
    if (llmRef.current) llmRef.current.scrollTop = llmRef.current.scrollHeight;
  }, [llmText]);

  // WS subscription. socket.io-client is dynamic-imported on the client.
  useEffect(() => {
    let cancelled = false;
    type SocketLike = {
      on: (ev: string, cb: (...args: unknown[]) => void) => void;
      emit: (ev: string, payload: unknown) => void;
      disconnect: () => void;
    };
    let socket: SocketLike | null = null;
    void (async () => {
      try {
        const { io } = await import("socket.io-client");
        if (cancelled) return;
        const wsUrl =
          process.env.NEXT_PUBLIC_WS_URL ??
          (typeof window !== "undefined" && window.location.hostname !== "localhost"
            ? `${window.location.protocol}//${window.location.hostname}:82`
            : "http://localhost:3003");
        socket = io(wsUrl, {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 5,
        }) as unknown as SocketLike;
        socket.on("connect", () => {
          setWsConnected(true);
          socket?.emit("join-analysis", { analysisRunId: runId, repositoryId });
        });
        socket.on("disconnect", () => setWsConnected(false));
        socket.on("analysis-progress", (payload: unknown) => {
          const p = payload as { progress?: { progress?: number; agentType?: string; message?: string } };
          if (p.progress) {
            setProgress({
              percent: p.progress.progress ?? 0,
              agentType: p.progress.agentType,
              message: p.progress.message,
            });
          }
        });
        socket.on("agent-event", (payload: unknown) => {
          const p = payload as { agentType: string; event: "start" | "end" | "failed" };
          setAgentTicks((prev) => [
            ...prev,
            { agentType: p.agentType, status: p.event === "start" ? "running" : p.event === "end" ? "success" : "failed", ts: Date.now() },
          ]);
        });
        socket.on("llm-delta", (payload: unknown) => {
          const p = payload as { delta?: string };
          if (p.delta) setLlmText((prev) => prev + p.delta);
        });
        socket.on("analysis-complete", () => {
          // REST poll will pick up the final status.
          void refresh();
        });
      } catch {
        // socket.io-client missing or blocked — REST polling carries the page.
      }
    })();
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [repositoryId, runId, refresh]);

  const terminal = run?.status === "COMPLETED" || run?.status === "FAILED" || run?.status === "CANCELLED";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/repositories/${repositoryId}/runs/${runId}`}
            className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
          >
            <ChevronLeft className="h-3 w-3" /> Back to run detail
          </Link>
          <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
            <Radio className="h-6 w-6" /> Live log
          </h1>
          <p className="text-sm text-muted-foreground">{runId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={wsConnected ? "default" : "secondary"}>
            {wsConnected ? "WS connected" : "polling"}
          </Badge>
          {run && (
            <Badge
              variant={
                run.status === "COMPLETED" ? "default" :
                run.status === "FAILED" ? "destructive" :
                "secondary"
              }
            >
              {run.status}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {progress.agentType ? `Running: ${progress.agentType}` : "Awaiting agent start…"}
              {progress.message ? ` — ${progress.message}` : ""}
            </span>
            <span className="font-medium">{progress.percent}%</span>
          </div>
          <Progress value={progress.percent} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Event timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={eventsRef} className="h-[400px] overflow-auto font-mono text-xs space-y-1 pr-2">
              {events.map((e) => (
                <div key={e.id} className="border-b py-1">
                  <span className="text-muted-foreground">{new Date(e.ts).toLocaleTimeString()}</span>{" "}
                  <Badge variant="outline" className="mr-1">{e.type}</Badge>
                  {e.agentType && <span className="text-muted-foreground mr-1">[{e.agentType}]</span>}
                  {e.content && <span className="break-words">{e.content.slice(0, 240)}{e.content.length > 240 ? "…" : ""}</span>}
                </div>
              ))}
              {events.length === 0 && (
                <div className="text-center text-muted-foreground py-12">Waiting for events…</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">LLM stream</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={llmRef}
              className="h-[400px] overflow-auto whitespace-pre-wrap font-mono text-xs bg-muted/20 rounded p-3"
            >
              {llmText || <span className="text-muted-foreground">Token stream will appear here when the next agent calls the model.</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Per-agent progress</CardTitle>
        </CardHeader>
        <CardContent>
          {agentTicks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No agent activity yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {agentTicks.map((t, i) => (
                <Badge
                  key={`${t.agentType}-${i}`}
                  variant={t.status === "success" ? "default" : t.status === "failed" ? "destructive" : "secondary"}
                >
                  {t.agentType} · {t.status}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {terminal && (
        <Card>
          <CardContent className="p-4 text-center text-sm text-muted-foreground">
            Run is {run?.status?.toLowerCase()}. The page will keep updating from the database;
            new live events will not arrive.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
