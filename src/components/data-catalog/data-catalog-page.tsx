"use client";

// Data Catalog page — Polish P1.3.
//
// Picks the latest DATA_CATALOG Document per repository. Document
// content is expected to be a Markdown body that may contain one or
// more ```mermaid erDiagram``` code fences. We render the fence
// content via mermaid (lazy-loaded) and the surrounding prose via
// react-markdown.

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Database, Download, Copy, Pencil } from "lucide-react";
import { apiFetch, showApiError } from "@/lib/api-client";
import { EditDocDialog } from "@/components/shared/edit-doc-dialog";
import { RegenerateButton } from "@/components/shared/regenerate-button";

type Doc = {
  id: string;
  repositoryId: string;
  repositoryName: string;
  title: string;
  version: string;
  content: string;
  status: string;
  generatedAt: string | null;
};
type Repo = { id: string; name: string; hasDataCatalog: boolean };
type ApiShape = { documents: Doc[]; repositories: Repo[] };

/** Pull out the first mermaid fence's body. */
function extractMermaid(md: string): { mermaid: string | null; rest: string } {
  const m = md.match(/```mermaid\s+([\s\S]*?)```/);
  if (!m) return { mermaid: null, rest: md };
  return { mermaid: m[1].trim(), rest: md.replace(m[0], "").trim() };
}

function MermaidBlock({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Mermaid is an optional dep — the import string is dynamic on
        // purpose so Next's bundler does not hard-fail when the package
        // is absent. When missing we render the source verbatim below.
        const mod = (await import(/* webpackIgnore: true */ "mermaid" as string).catch(() => null)) as
          | { default: { initialize: (o: unknown) => void; render: (id: string, src: string) => Promise<{ svg: string }> } }
          | null;
        if (!mod) {
          if (!cancelled) setFallback(true);
          return;
        }
        const mermaid = mod.default;
        if (cancelled) return;
        mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
        const id = `mmd-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, source);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (!cancelled) setFallback(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);
  if (fallback) {
    return (
      <pre className="overflow-auto p-3 bg-muted/30 rounded text-xs">
        <code>{source}</code>
      </pre>
    );
  }
  return <div ref={ref} className="overflow-auto p-2 bg-muted/30 rounded" />;
}

export function DataCatalogPage() {
  const [data, setData] = useState<ApiShape | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const res = await apiFetch<ApiShape>("/api/data-catalog");
      if ("data" in res) {
        setData(res.data);
        const first = res.data.repositories.find((r) => r.hasDataCatalog) ?? res.data.repositories[0];
        if (first) setSelectedRepo(first.id);
      } else {
        showApiError(res);
      }
      setLoading(false);
    });
  }, []);

  const doc = useMemo(
    () => data?.documents.find((d) => d.repositoryId === selectedRepo),
    [data, selectedRepo]
  );
  const parsed = useMemo(() => (doc ? extractMermaid(doc.content) : null), [doc]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" /> Data Catalog
          </h1>
          <p className="text-sm text-muted-foreground">ERD + data dictionary derived from migrations and ORM models.</p>
        </div>
        <Select value={selectedRepo} onValueChange={setSelectedRepo}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select repository" />
          </SelectTrigger>
          <SelectContent>
            {data?.repositories.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
                {r.hasDataCatalog ? " ✓" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {doc && parsed ? (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>{doc.title}</CardTitle>
                <CardDescription>
                  {doc.repositoryName} · version {doc.version}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge>{doc.status}</Badge>
                <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(doc.content)}>
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const blob = new Blob([doc.content], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${doc.repositoryName}-data-catalog.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-4 w-4 mr-1" /> Download
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
                <RegenerateButton repositoryId={doc.repositoryId} agentType="data-catalog" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {parsed.mermaid && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Entity-Relationship Diagram</h3>
                <MermaidBlock source={parsed.mermaid} />
              </div>
            )}
            {parsed.rest && (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{parsed.rest}</ReactMarkdown>
              </div>
            )}
          </CardContent>
          <EditDocDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            documentId={doc.id}
            initialTitle={doc.title}
            initialContent={doc.content}
            onSaved={() => window.location.reload()}
          />
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No data catalog generated yet for this repository.
            <br />
            <span className="text-sm">Run an analysis with the Data Catalog agent to populate it.</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
