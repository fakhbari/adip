"use client";

import { useEffect, useState } from "react";
import {
  Network,
  RefreshCw,
  Download,
  GitBranch,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ZoomIn,
  ZoomOut,
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
import ReactMarkdown from "react-markdown";

interface BoundedContext {
  id: string;
  name: string;
  description: string | null;
  domainType: string | null;
  relationships: { target: string; pattern: string }[];
}

interface ContextMapDoc {
  id: string;
  repositoryId: string;
  repositoryName: string;
  content: string;
  contexts: BoundedContext[];
  status: string;
  generatedAt: Date | null;
}

interface ContextMapData {
  documents: ContextMapDoc[];
  repositories: { id: string; name: string; hasContextMap: boolean }[];
}

const dddPatterns = [
  { name: "OHS", fullName: "Open Host Service", color: "bg-green-500" },
  { name: "ACL", fullName: "Anti-Corruption Layer", color: "bg-blue-500" },
  { name: "CF", fullName: "Conformist", color: "bg-yellow-500" },
  { name: "SK", fullName: "Shared Kernel", color: "bg-purple-500" },
  { name: "CS", fullName: "Customer/Supplier", color: "bg-orange-500" },
  { name: "PL", fullName: "Published Language", color: "bg-cyan-500" },
];

export function ContextMapPage() {
  const [data, setData] = useState<ContextMapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRepository, setSelectedRepository] = useState<string>("");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const fetchContextMap = async () => {
      try {
        const response = await fetch("/api/context-map");
        const result = await response.json();
        setData(result);
        if (result.repositories.length > 0) {
          const firstWithMap = result.repositories.find((r: any) => r.hasContextMap);
          setSelectedRepository(firstWithMap?.id || result.repositories[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch context map data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchContextMap();
  }, []);

  const selectedDocData = data?.documents.find((d) => d.repositoryId === selectedRepository);

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
          <h1 className="text-2xl font-bold tracking-tight">Context Mapping</h1>
          <p className="text-muted-foreground">
            Visualize bounded contexts and their relationships using DDD patterns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
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
                        {repo.hasContextMap ? (
                          <Badge className="bg-green-500/10 text-green-600 ml-2">Context Map</Badge>
                        ) : (
                          <Badge variant="secondary" className="ml-2">No Map</Badge>
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
        <Tabs defaultValue="diagram" className="space-y-4">
          <TabsList>
            <TabsTrigger value="diagram">Context Diagram</TabsTrigger>
            <TabsTrigger value="contexts">Bounded Contexts</TabsTrigger>
            <TabsTrigger value="patterns">DDD Patterns</TabsTrigger>
            <TabsTrigger value="markdown">Documentation</TabsTrigger>
          </TabsList>

          {/* Context Diagram */}
          <TabsContent value="diagram">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Context Map Diagram</CardTitle>
                    <CardDescription>
                      Visual representation of bounded contexts and their relationships
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground w-12 text-center">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className="border rounded-lg p-4 bg-muted/30 min-h-[400px] overflow-auto"
                  style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                >
                  <svg width="800" height="500" viewBox="0 0 800 500">
                    {/* Draw bounded contexts as boxes */}
                    {selectedDocData.contexts.map((ctx, index) => {
                      const positions = [
                        { x: 100, y: 100 },
                        { x: 400, y: 100 },
                        { x: 250, y: 300 },
                      ];
                      const pos = positions[index % positions.length];
                      const colors = ["#3178c6", "#3572A5", "#b07219"];
                      
                      return (
                        <g key={ctx.id}>
                          <rect
                            x={pos.x}
                            y={pos.y}
                            width="200"
                            height="100"
                            rx="8"
                            fill={colors[index % colors.length]}
                            fillOpacity="0.1"
                            stroke={colors[index % colors.length]}
                            strokeWidth="2"
                          />
                          <text
                            x={pos.x + 100}
                            y={pos.y + 40}
                            textAnchor="middle"
                            className="text-sm font-medium"
                            fill="currentColor"
                          >
                            {ctx.name}
                          </text>
                          <text
                            x={pos.x + 100}
                            y={pos.y + 60}
                            textAnchor="middle"
                            className="text-xs"
                            fill="currentColor"
                            fillOpacity="0.7"
                          >
                            {ctx.domainType || "Bounded Context"}
                          </text>
                        </g>
                      );
                    })}

                    {/* Draw relationships */}
                    {selectedDocData.contexts.flatMap((ctx) =>
                      ctx.relationships.map((rel, relIndex) => {
                        // Find source and target positions
                        const sourceIndex = selectedDocData.contexts.findIndex((c) => c.id === ctx.id);
                        const targetIndex = selectedDocData.contexts.findIndex(
                          (c) => c.name === rel.target
                        );
                        const positions = [
                          { x: 100, y: 100 },
                          { x: 400, y: 100 },
                          { x: 250, y: 300 },
                        ];
                        const source = positions[sourceIndex % positions.length];
                        const target = positions[targetIndex % positions.length];

                        return (
                          <g key={`${ctx.id}-${relIndex}`}>
                            <line
                              x1={source.x + 200}
                              y1={source.y + 50}
                              x2={target.x}
                              y2={target.y + 50}
                              stroke="currentColor"
                              strokeOpacity="0.3"
                              strokeWidth="2"
                              markerEnd="url(#arrow)"
                            />
                            <text
                              x={(source.x + 200 + target.x) / 2}
                              y={(source.y + 50 + target.y + 50) / 2 - 5}
                              textAnchor="middle"
                              className="text-xs"
                              fill="currentColor"
                              fillOpacity="0.7"
                            >
                              {rel.pattern}
                            </text>
                          </g>
                        );
                      })
                    )}

                    {/* Arrow marker */}
                    <defs>
                      <marker
                        id="arrow"
                        viewBox="0 0 10 10"
                        refX="5"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" fillOpacity="0.3" />
                      </marker>
                    </defs>
                  </svg>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bounded Contexts */}
          <TabsContent value="contexts">
            <Card>
              <CardHeader>
                <CardTitle>Bounded Contexts</CardTitle>
                <CardDescription>
                  {selectedDocData.contexts.length} bounded contexts identified
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {selectedDocData.contexts.map((ctx) => (
                    <Card key={ctx.id}>
                      <CardHeader className="py-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{ctx.name}</CardTitle>
                          <Badge variant="outline">{ctx.domainType || "Context"}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="py-2">
                        <p className="text-sm text-muted-foreground">
                          {ctx.description || "No description available"}
                        </p>
                        {ctx.relationships.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-medium mb-2">Relationships:</p>
                            <div className="flex flex-wrap gap-1">
                              {ctx.relationships.map((rel, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {rel.pattern} → {rel.target}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DDD Patterns */}
          <TabsContent value="patterns">
            <Card>
              <CardHeader>
                <CardTitle>DDD Relationship Patterns</CardTitle>
                <CardDescription>
                  Patterns used for context relationships
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {dddPatterns.map((pattern) => {
                    const count = selectedDocData.contexts.flatMap((c) => c.relationships).filter(
                      (r) => r.pattern === pattern.name
                    ).length;
                    return (
                      <Card key={pattern.name}>
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-3 w-3 rounded-full ${pattern.color}`} />
                            <div>
                              <p className="font-medium">{pattern.name}</p>
                              <p className="text-sm text-muted-foreground">{pattern.fullName}</p>
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            Used in {count} relationship{count !== 1 ? "s" : ""}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documentation */}
          <TabsContent value="markdown">
            <Card>
              <CardHeader>
                <CardTitle>Context Map Documentation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{selectedDocData.content}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Network className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Context Map Available</h3>
              <p className="text-muted-foreground mb-4">
                Generate a context map for this repository to visualize bounded contexts.
              </p>
              <Button>
                <RefreshCw className="mr-2 h-4 w-4" />
                Generate Context Map
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Repository Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Context Map Coverage</CardTitle>
          <CardDescription>
            Overview of context maps across all repositories
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
                      {repo.hasContextMap ? "Context map available" : "No context map"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {repo.hasContextMap ? (
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
