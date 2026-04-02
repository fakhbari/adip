"use client";

import { useEffect, useState } from "react";
import {
  Box,
  RefreshCw,
  Download,
  GitBranch,
  ChevronRight,
  Server,
  Database,
  Globe,
  Users,
  Layers,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import ReactMarkdown from "react-markdown";

interface C4Component {
  id: string;
  name: string;
  type: "person" | "system" | "container" | "component";
  level: number;
  description: string | null;
  technology: string | null;
  relationships: { target: string; label: string }[];
}

interface C4Document {
  id: string;
  repositoryId: string;
  repositoryName: string;
  level: number;
  content: string;
  components: C4Component[];
  generatedAt: Date | null;
  status: string;
}

interface C4Data {
  documents: C4Document[];
  repositories: { id: string; name: string; hasC4: boolean }[];
}

export function C4Page() {
  const [data, setData] = useState<C4Data | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRepository, setSelectedRepository] = useState<string>("");
  const [selectedDocument, setSelectedDocument] = useState<C4Document | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const fetchC4 = async () => {
      try {
        const response = await fetch("/api/c4");
        const result = await response.json();
        setData(result);
        if (result.repositories.length > 0) {
          setSelectedRepository(result.repositories[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch C4 data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchC4();
  }, []);

  const selectedDoc = data?.documents.find((d) => d.repositoryId === selectedRepository);

  const getLevelIcon = (level: number) => {
    switch (level) {
      case 1:
        return <Globe className="h-4 w-4" />;
      case 2:
        return <Server className="h-4 w-4" />;
      case 3:
        return <Layers className="h-4 w-4" />;
      default:
        return <Box className="h-4 w-4" />;
    }
  };

  const getLevelName = (level: number) => {
    switch (level) {
      case 1:
        return "System Context";
      case 2:
        return "Container";
      case 3:
        return "Component";
      default:
        return "Unknown";
    }
  };

  const renderMermaidDiagram = (content: string) => {
    // Extract mermaid code blocks
    const mermaidMatch = content.match(/```mermaid\n([\s\S]*?)```/);
    if (mermaidMatch) {
      return mermaidMatch[1];
    }
    return null;
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
          <h1 className="text-2xl font-bold tracking-tight">C4 Documentation</h1>
          <p className="text-muted-foreground">
            Visualize system architecture using the C4 model
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
                        {repo.hasC4 ? (
                          <Badge className="bg-green-500/10 text-green-600 ml-2">C4</Badge>
                        ) : (
                          <Badge variant="secondary" className="ml-2">No C4</Badge>
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

      {selectedDoc ? (
        <Tabs defaultValue="context" className="space-y-4">
          <TabsList>
            <TabsTrigger value="context">
              <Globe className="mr-2 h-4 w-4" />
              Level 1: Context
            </TabsTrigger>
            <TabsTrigger value="container">
              <Server className="mr-2 h-4 w-4" />
              Level 2: Containers
            </TabsTrigger>
            <TabsTrigger value="component">
              <Layers className="mr-2 h-4 w-4" />
              Level 3: Components
            </TabsTrigger>
            <TabsTrigger value="raw">
              <Box className="mr-2 h-4 w-4" />
              Raw Document
            </TabsTrigger>
          </TabsList>

          {/* Context Diagram */}
          <TabsContent value="context">
            <Card>
              <CardHeader>
                <CardTitle>System Context Diagram</CardTitle>
                <CardDescription>
                  High-level view of the system and its interactions with users and external systems
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg p-4 bg-muted/30 min-h-[400px] flex items-center justify-center">
                  <div className="text-center">
                    <Globe className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-medium">{selectedDoc.repositoryName}</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      C4 Context Diagram will be rendered here
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Container Diagram */}
          <TabsContent value="container">
            <Card>
              <CardHeader>
                <CardTitle>Container Diagram</CardTitle>
                <CardDescription>
                  Shows the high-level containers (applications, databases, etc.) within the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {selectedDoc.components
                    .filter((c) => c.level === 2)
                    .map((component) => (
                      <Card
                        key={component.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setSelectedDocument({ ...selectedDoc, components: [component] } as any)}
                      >
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-2 mb-2">
                            {component.type === "container" ? (
                              <Server className="h-5 w-5 text-blue-500" />
                            ) : (
                              <Database className="h-5 w-5 text-green-500" />
                            )}
                            <span className="font-medium">{component.name}</span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {component.description}
                          </p>
                          {component.technology && (
                            <Badge variant="outline" className="mt-2">
                              {component.technology}
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Component Diagram */}
          <TabsContent value="component">
            <Card>
              <CardHeader>
                <CardTitle>Component Diagram</CardTitle>
                <CardDescription>
                  Shows the components within a container and their relationships
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedDoc.components
                    .filter((c) => c.level === 3)
                    .map((component) => (
                      <div
                        key={component.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <Layers className="h-5 w-5 text-purple-500" />
                          <div>
                            <p className="font-medium">{component.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {component.description}
                            </p>
                          </div>
                        </div>
                        {component.technology && (
                          <Badge variant="outline">{component.technology}</Badge>
                        )}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Raw Document */}
          <TabsContent value="raw">
            <Card>
              <CardHeader>
                <CardTitle>Generated Documentation</CardTitle>
                <CardDescription>
                  Raw markdown content of the generated C4 documentation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{selectedDoc.content}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Box className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No C4 Documentation Available</h3>
              <p className="text-muted-foreground mb-4">
                Generate C4 documentation for this repository to visualize its architecture.
              </p>
              <Button>
                <RefreshCw className="mr-2 h-4 w-4" />
                Generate Documentation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Repositories Overview */}
      <Card>
        <CardHeader>
          <CardTitle>C4 Documentation Status</CardTitle>
          <CardDescription>
            Overview of C4 documentation across all repositories
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
                      {repo.hasC4 ? "Documentation available" : "No documentation"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {repo.hasC4 ? (
                    <Badge className="bg-green-500/10 text-green-600">Complete</Badge>
                  ) : (
                    <Badge variant="secondary">Missing</Badge>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
