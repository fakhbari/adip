"use client";

// Audit log table — Polish P1.7.
//
// Filters: action / entityType / date range. Pagination via offset.
// CSV download passes the same query params through to the export route.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch, showApiError } from "@/lib/api-client";

type Row = {
  id: string;
  tenantId: string | null;
  userId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: string | null;
  createdAt: string;
};

type ApiShape = { rows: Row[]; total: number; pageSize: number; offset: number };

const PAGE_SIZE = 100;

export function AuditLogView() {
  const [filters, setFilters] = useState({ action: "", entityType: "", from: "", to: "" });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ApiShape | null>(null);
  const [loading, setLoading] = useState(true);

  const query = useCallback(() => {
    const sp = new URLSearchParams();
    if (filters.action) sp.set("action", filters.action);
    if (filters.entityType) sp.set("entityType", filters.entityType);
    if (filters.from) sp.set("from", filters.from);
    if (filters.to) sp.set("to", filters.to);
    sp.set("offset", String(offset));
    sp.set("pageSize", String(PAGE_SIZE));
    return sp.toString();
  }, [filters, offset]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<ApiShape>(`/api/admin/audit?${query()}`);
    if ("data" in res) setData(res.data);
    else showApiError(res);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const total = data?.total ?? 0;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Audit log</h1>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/admin/audit/export.csv?${query()}`}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-2 grid-cols-2 md:grid-cols-4 p-4">
          <Input placeholder="action (e.g. repository.create)" value={filters.action} onChange={(e) => { setOffset(0); setFilters({ ...filters, action: e.target.value }); }} />
          <Input placeholder="entityType (e.g. Repository)" value={filters.entityType} onChange={(e) => { setOffset(0); setFilters({ ...filters, entityType: e.target.value }); }} />
          <Input type="datetime-local" value={filters.from} onChange={(e) => { setOffset(0); setFilters({ ...filters, from: e.target.value }); }} />
          <Input type="datetime-local" value={filters.to} onChange={(e) => { setOffset(0); setFilters({ ...filters, to: e.target.value }); }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {total} matching rows · showing {showingFrom}–{showingTo}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data && data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No activity matches the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Entity</th>
                    <th className="py-2 pr-4">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="py-2 pr-4">{r.userId === "system" ? <Badge variant="secondary">system</Badge> : r.userId}</td>
                      <td className="py-2 pr-4"><Badge variant="outline">{r.action}</Badge></td>
                      <td className="py-2 pr-4">{r.entityType ?? "—"}{r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}</td>
                      <td className="py-2 pr-4 max-w-md truncate text-muted-foreground" title={r.details ?? ""}>{r.details ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))} disabled={offset === 0 || loading}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total || loading}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
