"use client";

import { useEffect, useState } from "react";
import {
  FileCode,
  RefreshCw,
  Download,
  GitBranch,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Copy,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface OpenAPIDoc {
  id: string;
  repositoryId: string;
  repositoryName: string;
  title: string;
  version: string;
  description: string;
  endpointCount: number;
  schemaCount: number;
  content: string;
  status: string;
  generatedAt: Date | null;
}

interface OpenAPIData {
  documents: OpenAPIDoc[];
  repositories: { id: string; name: string; hasOpenAPI: boolean }[];
}

export function OpenAPIPage() {
  const [data, setData] = useState<OpenAPIData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRepository, setSelectedRepository] = useState<string>("");
  const [selectedDoc, setSelectedDoc] = useState<OpenAPIDoc | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchOpenAPI = async () => {
      try {
        const response = await fetch("/api/openapi");
        const result = await response.json();
        setData(result);
        if (result.repositories.length > 0) {
          const firstWithOpenAPI = result.repositories.find((r: any) => r.hasOpenAPI);
          setSelectedRepository(firstWithOpenAPI?.id || result.repositories[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch OpenAPI data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOpenAPI();
  }, []);

  const selectedDocData = data?.documents.find((d) => d.repositoryId === selectedRepository);

  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">OpenAPI Documentation</h1>
          <p className="text-muted-foreground">
            View and manage OpenAPI specifications for your APIs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export All
          </Button>
          <Button>
            <RefreshCw className="mr-2 h-4 w-4" />
            Generate
          </Button>
        </div>
      </div>

      {/* Repository Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Select Repository</label>
              <Select value={selectedRepository} onValueChange={setSelectedRepository}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a repository" />
                </SelectTrigger>
                <SelectContent>
                  {data?.repositories.map((repo) => (
                    <SelectItem key={repo.id} value={repo.id}>
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        <span>{repo.name}</span>
                        {repo.hasOpenAPI ? (
                          <Badge className="bg-green-500/10 text-green-600 ml-2">OpenAPI</Badge>
                        ) : (
                          <Badge variant="secondary" className="ml-2">No Spec</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedDocData ? (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="schemas">Schemas</TabsTrigger>
            <TabsTrigger value="yaml">YAML Spec</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">API Title</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold">{selectedDocData.title}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Version</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="text-lg">v{selectedDocData.version}</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Endpoints</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold">{selectedDocData.endpointCount}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{selectedDocData.description}</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Endpoints */}
          <TabsContent value="endpoints">
            <Card>
              <CardHeader>
                <CardTitle>API Endpoints</CardTitle>
                <CardDescription>
                  {selectedDocData.endpointCount} endpoints documented
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {["GET /api/users", "POST /api/users", "GET /api/users/{id}", "PUT /api/users/{id}", "DELETE /api/users/{id}", "GET /api/auth/login", "POST /api/auth/login", "POST /api/auth/logout"].map((endpoint, index) => {
                    const method = endpoint.split(" ")[0];
                    const path = endpoint.split(" ")[1];
                    const methodColors: Record<string, string> = {
                      GET: "bg-green-500/10 text-green-600",
                      POST: "bg-blue-500/10 text-blue-600",
                      PUT: "bg-yellow-500/10 text-yellow-600",
                      DELETE: "bg-red-500/10 text-red-600",
                      PATCH: "bg-purple-500/10 text-purple-600",
                    };
                    return (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-lg border">
                        <Badge className={methodColors[method]}>{method}</Badge>
                        <code className="text-sm font-mono">{path}</code>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schemas */}
          <TabsContent value="schemas">
            <Card>
              <CardHeader>
                <CardTitle>Data Schemas</CardTitle>
                <CardDescription>
                  {selectedDocData.schemaCount} schemas defined
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {["User", "UserInput", "AuthResponse", "ErrorResponse", "Pagination", "UserRole"].map((schema, index) => (
                    <Card key={index}>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">{schema}</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        <code className="text-xs font-mono text-muted-foreground">
                          {`{ id: string, name: string, ... }`}
                        </code>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* YAML Spec */}
          <TabsContent value="yaml">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>OpenAPI Specification</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => handleCopy(selectedDocData.content)}>
                    {copied ? <CheckCircle className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={selectedDocData.content}
                  readOnly
                  className="font-mono text-xs h-96"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileCode className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No OpenAPI Specification Available</h3>
              <p className="text-muted-foreground mb-4">
                Generate OpenAPI documentation for this repository.
              </p>
              <Button>
                <RefreshCw className="mr-2 h-4 w-4" />
                Generate OpenAPI Spec
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Repository Overview */}
      <Card>
        <CardHeader>
          <CardTitle>OpenAPI Coverage</CardTitle>
          <CardDescription>
            Overview of OpenAPI documentation across all repositories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data?.repositories.map((repo) => (
              <div
                key={repo.id}
                className="flex items-center justify-between p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedRepository(repo.id)}
              >
                <div className="flex items-center gap-3">
                  <GitBranch className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{repo.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {repo.hasOpenAPI ? "OpenAPI spec available" : "No specification"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {repo.hasOpenAPI ? (
                    <Badge className="bg-green-500/10 text-green-600">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Complete
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="mr-1 h-3 w-3" />
                      Missing
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
