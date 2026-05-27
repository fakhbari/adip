"use client";

// Notification deliveries table. Polish P6.4.
//
// Fetches `/api/admin/notifications` on mount + after a retry, renders
// a single table with channel / status / created-at / error. Failed
// rows surface a "Retry now" button that POSTs back with the deliveryId.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Send } from "lucide-react";
import { apiFetch, showApiError } from "@/lib/api-client";

type Delivery = {
  id: string;
  kind: string;
  channel: string;
  status: string;
  error: string | null;
  retryCount: number;
  sentAt: string | null;
  createdAt: string;
  payload: string;
};

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "sent" ? "default" : status === "failed" ? "destructive" : status === "retrying" ? "secondary" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export function AdminNotificationsView() {
  const [rows, setRows] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ deliveries: Delivery[] }>("/api/admin/notifications");
    if ("data" in res) setRows(res.data.deliveries);
    else showApiError(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Defer the first fetch into a microtask so we don't synchronously
    // setState inside the effect body (React 19 rule).
    void Promise.resolve().then(() => load());
  }, [load]);

  const retry = async (id: string) => {
    setRetrying(id);
    const res = await apiFetch<{ ok: true }>("/api/admin/notifications", {
      method: "POST",
      json: { deliveryId: id },
    });
    if ("data" in res) {
      // Best-effort UI nudge — the worker picks up the job asynchronously.
      await load();
    } else {
      showApiError(res);
    }
    setRetrying(null);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notification deliveries</h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Last 50 attempts</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No deliveries yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-4">Created</th>
                    <th className="py-2 pr-4">Channel</th>
                    <th className="py-2 pr-4">Kind</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Retries</th>
                    <th className="py-2 pr-4">Error</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-4">{r.channel}</td>
                      <td className="py-2 pr-4">{r.kind}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="py-2 pr-4">{r.retryCount}</td>
                      <td className="py-2 pr-4 max-w-xs truncate" title={r.error ?? ""}>
                        {r.error ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {r.status === "failed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={retrying === r.id}
                            onClick={() => retry(r.id)}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            {retrying === r.id ? "Queued…" : "Retry now"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
