"use client";

// Run history view — Polish P1.4.
//
// Paged table of AnalysisRun rows. 50/page; the API supports offset/pageSize.
// Each row links to /repositories/:id/runs/:runId.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { apiFetch, showApiError } from "@/lib/api-client";

type Run = {
  id: string;
  status: string;
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  documentsGenerated: number | null;
  createdAt: string;
};

type ApiShape = { runs: Run[]; total: number; pageSize: number; offset: number };

const PAGE_SIZE = 50;

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "COMPLETED" ? "default" :
    status === "FAILED" || status === "CANCELLED" ? "destructive" :
    status === "RUNNING" || status === "QUEUED" ? "secondary" :
    "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export function RunHistoryView({ repositoryId }: { repositoryId: string }) {
  const [data, setData] = useState<ApiShape | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<ApiShape>(
      `/api/repositories/${repositoryId}/runs?offset=${offset}&pageSize=${PAGE_SIZE}`
    );
    if ("data" in res) setData(res.data);
    else showApiError(res);
    setLoading(false);
  }, [repositoryId, offset]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const total = data?.total ?? 0;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analysis runs</h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {total} total · showing {showingFrom}–{showingTo}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data && data.runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No runs yet. Trigger an analysis from the repository page.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-4">Started</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Trigger</th>
                    <th className="py-2 pr-4">Duration</th>
                    <th className="py-2 pr-4">Docs</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {data?.runs.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {new Date(r.startedAt ?? r.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-2 pr-4">{r.triggeredBy}</td>
                      <td className="py-2 pr-4">{r.duration ? `${r.duration}s` : "—"}</td>
                      <td className="py-2 pr-4">{r.documentsGenerated ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/repositories/${repositoryId}/runs/${r.id}`}
                          className="text-primary underline-offset-2 hover:underline inline-flex items-center gap-1"
                        >
                          Details <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
              disabled={offset === 0 || loading}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total || loading}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
