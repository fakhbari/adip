"use client";

// AsyncAPI page — Polish P1.2.
//
// Lighter twin of the OpenAPI viewer: pick a repository, show its
// latest ASYNCAPI Document content with copy / download.
// Empty-state mentions running an analysis (which dispatches the
// AsyncAPIAgent from the orchestrator).

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Radio, Copy, Download, Pencil } from "lucide-react";
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

type Repo = { id: string; name: string; hasAsyncAPI: boolean };

type ApiShape = { documents: Doc[]; repositories: Repo[] };

export function AsyncAPIPage() {
  const [data, setData] = useState<ApiShape | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const res = await apiFetch<ApiShape>("/api/asyncapi");
      if ("data" in res) {
        setData(res.data);
        const first = res.data.repositories.find((r) => r.hasAsyncAPI) ?? res.data.repositories[0];
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
            <Radio className="h-6 w-6" /> AsyncAPI
          </h1>
          <p className="text-sm text-muted-foreground">Event-driven API specifications.</p>
        </div>
        <Select value={selectedRepo} onValueChange={setSelectedRepo}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select repository" />
          </SelectTrigger>
          <SelectContent>
            {data?.repositories.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
                {r.hasAsyncAPI ? " ✓" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {doc ? (
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
                    const blob = new Blob([doc.content], { type: "text/yaml" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${doc.repositoryName}-asyncapi.yaml`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-4 w-4 mr-1" /> Download
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
                <RegenerateButton repositoryId={doc.repositoryId} agentType="asyncapi" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea readOnly value={doc.content} className="font-mono text-xs h-[600px]" />
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
            No AsyncAPI specification available for this repository yet.
            <br />
            <span className="text-sm">Run an analysis with the AsyncAPI agent to generate one.</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
