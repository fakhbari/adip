"use client";

// Repository management page with analysis WebSocket connection
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  GitBranch,
  Search,
  Play,
  CheckCircle,
  AlertTriangle,
  XCircle,
  MoreHorizontal,
  RefreshCw,
  FileText,
  Plus,
  Loader2,
  Globe,
  ExternalLink,
  Link2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useAnalysisWebSocket } from "@/hooks/use-analysis-websocket";

interface Connection {
  id: string;
  name: string;
  type: "bitbucket" | "gitlab" | "github";
  url: string;
  isActive: boolean;
  lastSync: Date | null;
  hasToken: boolean;
}

interface Repository {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  connectionId?: string | null;
  connectionName?: string;
  connectionType?: string;
  connectionUrl?: string;
  languages: string[];
  lastAnalyzedAt: Date | null;
  docStatus: "complete" | "partial" | "missing";
  docTypes: {
    c4: boolean;
    adr: boolean;
    openapi: boolean;
    asyncapi: boolean;
    contextMap: boolean;
    dataCatalog: boolean;
  };
  documentCount: number;
  adrCount: number;
}

interface RepositoriesData {
  repositories: Repository[];
}

interface AddRepositoryForm {
  name: string;
  slug: string;
  description: string;
  connectionId: string;
  repositoryPath: string; // For connections: org/repo-name
  repositoryUrl: string;  // For Direct URL: full URL
}

const initialForm: AddRepositoryForm = {
  name: "",
  slug: "",
  description: "",
  connectionId: "",
  repositoryPath: "",
  repositoryUrl: "",
};

// Special value for Direct URL option
const DIRECT_URL_VALUE = "__direct_url__";

// Language colors for badges
const languageColors: Record<string, string> = {
  TypeScript: "bg-blue-500/10 text-blue-600 border-blue-200",
  JavaScript: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  Python: "bg-green-500/10 text-green-600 border-green-200",
  Java: "bg-red-500/10 text-red-600 border-red-200",
  Kotlin: "bg-purple-500/10 text-purple-600 border-purple-200",
  Go: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
  Rust: "bg-orange-500/10 text-orange-600 border-orange-200",
  C: "bg-gray-500/10 text-gray-600 border-gray-200",
  "C#": "bg-purple-500/10 text-purple-600 border-purple-200",
  Ruby: "bg-red-500/10 text-red-600 border-red-200",
  PHP: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
  Swift: "bg-orange-500/10 text-orange-600 border-orange-200",
};

// Connection type icons
const connectionTypeIcons: Record<string, string> = {
  github: "🐙",
  gitlab: "🦊",
  bitbucket: "📘",
};

export function RepositoriesPage() {
  const [data, setData] = useState<RepositoriesData>({ repositories: [] });
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<AddRepositoryForm>(initialForm);

  // Use the analysis WebSocket hook
  const { isConnected, isAnalyzing, progress, runAnalysis } = useAnalysisWebSocket(() => {
    fetchRepositories(); // Refresh the list when analysis completes
  });

  const fetchConnections = useCallback(async () => {
    try {
      const response = await fetch("/api/settings/connections");
      if (response.ok) {
        const result = await response.json();
        setConnections(result.map((c: Connection) => ({
          ...c,
          hasToken: true, // We assume connections with tokens
        })));
      }
    } catch (error) {
      console.error("Failed to fetch connections:", error);
    } finally {
      setIsLoadingConnections(false);
    }
  }, []);

  const fetchRepositories = useCallback(async (showRefreshLoader = false) => {
    if (showRefreshLoader) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);

      const response = await fetch(`/api/repositories?${params.toString()}`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch repositories:", error);
      toast.error("Failed to fetch repositories");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchConnections();
    fetchRepositories();
  }, [fetchConnections, fetchRepositories]);

  const handleRefresh = () => {
    fetchRepositories(true);
    toast.success("Repositories refreshed");
  };

  // Extract repository name from path (org/repo-name)
  const extractNameFromPath = (path: string): string | null => {
    const parts = path.split("/").filter(Boolean);
    if (parts.length >= 1) {
      return parts[parts.length - 1];
    }
    return null;
  };

  // Extract repository name from URL
  const extractNameFromUrl = (url: string): { name: string; slug: string } | null => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts.length >= 2) {
        const repoName = pathParts[pathParts.length - 1].replace(/\.git$/, "");
        return {
          name: repoName,
          slug: repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        };
      }
    } catch {
      // Invalid URL
    }
    return null;
  };

  // Handle repository path change (for connections)
  const handleRepositoryPathChange = (path: string) => {
    setForm(prev => ({
      ...prev,
      repositoryPath: path,
    }));

    // Auto-extract name from path
    const name = extractNameFromPath(path);
    if (name && !form.name) {
      setForm(prev => ({
        ...prev,
        name: name,
        slug: name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      }));
    }
  };

  // Handle repository URL change (for Direct URL)
  const handleRepositoryUrlChange = (url: string) => {
    setForm(prev => ({
      ...prev,
      repositoryUrl: url,
    }));

    // Auto-extract name from URL
    const extracted = extractNameFromUrl(url);
    if (extracted) {
      setForm(prev => ({
        ...prev,
        name: extracted.name,
        slug: extracted.slug,
      }));
    }
  };

  // Handle connection selection change
  const handleConnectionChange = (value: string) => {
    setForm(prev => ({
      ...prev,
      connectionId: value,
      // Clear path/URL when switching connection type
      repositoryPath: value === DIRECT_URL_VALUE ? "" : prev.repositoryPath,
      repositoryUrl: value !== DIRECT_URL_VALUE ? "" : prev.repositoryUrl,
      // Clear name when switching
      name: "",
      slug: "",
    }));
  };

  const handleAddRepository = async () => {
    // Validate based on connection type
    if (form.connectionId === DIRECT_URL_VALUE) {
      if (!form.repositoryUrl.trim()) {
        toast.error("Repository URL is required for Direct URL");
        return;
      }
      // Validate URL format
      try {
        new URL(form.repositoryUrl);
      } catch {
        toast.error("Please enter a valid URL");
        return;
      }
    } else {
      if (!form.connectionId) {
        toast.error("Please select a connection");
        return;
      }
      if (!form.repositoryPath.trim()) {
        toast.error("Repository path is required");
        return;
      }
    }

    if (!form.name.trim()) {
      toast.error("Could not determine repository name");
      return;
    }

    setIsAdding(true);
    try {
      const response = await fetch("/api/repositories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug || form.name.toLowerCase().replace(/\s+/g, "-"),
          description: form.description || null,
          connectionId: form.connectionId === DIRECT_URL_VALUE ? null : form.connectionId,
          repositoryPath: form.connectionId !== DIRECT_URL_VALUE ? form.repositoryPath : null,
          repositoryUrl: form.connectionId === DIRECT_URL_VALUE ? form.repositoryUrl : null,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast.success("Repository added successfully");
        setIsAddDialogOpen(false);
        setForm(initialForm);
        fetchRepositories();
      } else {
        toast.error(result.error || "Failed to add repository");
      }
    } catch (error) {
      console.error("Failed to add repository:", error);
      toast.error("Failed to add repository");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteRepository = async (repoId: string) => {
    try {
      const response = await fetch(`/api/repositories?id=${repoId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Repository removed successfully");
        fetchRepositories();
      } else {
        toast.error("Failed to remove repository");
      }
    } catch (error) {
      console.error("Failed to delete repository:", error);
      toast.error("Failed to remove repository");
    }
  };



  const getStatusIcon = (status: string) => {
    switch (status) {
      case "complete":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "partial":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "missing":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "complete":
        return <Badge className="bg-green-500/10 text-green-600">Complete</Badge>;
      case "partial":
        return <Badge className="bg-yellow-500/10 text-yellow-600">Partial</Badge>;
      case "missing":
        return <Badge className="bg-red-500/10 text-red-600">Missing</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getDocTypeBadge = (hasDoc: boolean, label: string) => {
    return hasDoc ? (
      <Badge variant="outline" className="bg-green-500/5 text-green-600 border-green-200">
        {label}
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-gray-500/5 text-gray-400 border-gray-200">
        {label}
      </Badge>
    );
  };

  const getLanguageBadge = (language: string) => {
    const colorClass = languageColors[language] || "bg-gray-500/10 text-gray-600 border-gray-200";
    return (
      <Badge key={language} variant="outline" className={colorClass}>
        {language}
      </Badge>
    );
  };

  const filteredRepos = data.repositories.filter((repo) => {
    const matchesSearch = search === "" || 
      repo.name.toLowerCase().includes(search.toLowerCase()) ||
      (repo.description?.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || repo.docStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Generate slug from name
  const handleNameChange = (name: string) => {
    setForm(prev => ({
      ...prev,
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    }));
  };

  // Get selected connection info
  const selectedConnection = connections.find(c => c.id === form.connectionId);
  const isDirectUrl = form.connectionId === DIRECT_URL_VALUE;

  // Check if form is valid for submission
  const isFormValid = () => {
    if (isDirectUrl) {
      return form.repositoryUrl.trim() && form.name.trim();
    }
    return form.connectionId && form.repositoryPath.trim() && form.name.trim();
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Repositories</h1>
          <p className="text-muted-foreground">
            Manage and analyze your organization&apos;s code repositories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) setForm(initialForm);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Repository
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add New Repository</DialogTitle>
                <DialogDescription>
                  Connect a repository to ADIP for analysis and documentation generation.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {/* Connection Selection */}
                <div className="grid gap-2">
                  <Label>Connection *</Label>
                  <Select
                    value={form.connectionId}
                    onValueChange={handleConnectionChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a connection..." />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Connections first */}
                      {connections.map((conn) => (
                        <SelectItem key={conn.id} value={conn.id}>
                          <div className="flex items-center gap-2">
                            <span>{connectionTypeIcons[conn.type] || "🔗"}</span>
                            <span>{conn.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({new URL(conn.url).hostname})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                      
                      {/* Separator */}
                      {connections.length > 0 && (
                        <SelectItem value="__separator__" disabled>
                          ────────────────────────
                        </SelectItem>
                      )}
                      
                      {/* Direct URL option */}
                      <SelectItem value={DIRECT_URL_VALUE}>
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-blue-500" />
                          <span>Direct URL</span>
                          <span className="text-xs text-muted-foreground">
                            (Public repos only)
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {selectedConnection && (
                    <p className="text-xs text-muted-foreground">
                      Accessing repositories via {selectedConnection.name}
                    </p>
                  )}
                  
                  {isDirectUrl && (
                    <p className="text-xs text-muted-foreground">
                      For public repositories without API token
                    </p>
                  )}
                </div>

                {/* Repository Path - only for connections */}
                {form.connectionId && !isDirectUrl && (
                  <div className="grid gap-2">
                    <Label htmlFor="repoPath">Repository Path *</Label>
                    <Input
                      id="repoPath"
                      placeholder="org-name/repository-name"
                      value={form.repositoryPath}
                      onChange={(e) => handleRepositoryPathChange(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the path in format: organization/repository-name
                    </p>
                  </div>
                )}

                {/* Repository URL - only for Direct URL */}
                {isDirectUrl && (
                  <div className="grid gap-2">
                    <Label htmlFor="repoUrl">Repository URL *</Label>
                    <Input
                      id="repoUrl"
                      placeholder="https://github.com/org/repository"
                      value={form.repositoryUrl}
                      onChange={(e) => handleRepositoryUrlChange(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the full repository URL
                    </p>
                  </div>
                )}

                <Separator />

                {/* Repository Name - only for connections */}
                {form.connectionId && !isDirectUrl && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="name">Repository Name *</Label>
                      <Input
                        id="name"
                        placeholder="e.g., auth-service"
                        value={form.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Auto-extracted from path, can be edited
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="slug">Slug</Label>
                      <Input
                        id="slug"
                        placeholder="auto-generated from name"
                        value={form.slug}
                        onChange={(e) => setForm(prev => ({ ...prev, slug: e.target.value }))}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Brief description of the repository"
                        value={form.description}
                        onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                        rows={2}
                      />
                    </div>
                  </>
                )}

                {/* For Direct URL - show name and description as read-only/info */}
                {isDirectUrl && (
                  <>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Detected Name:</span>
                        <span className="text-sm">{form.name || "—"}</span>
                      </div>
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="description-direct">Description</Label>
                      <Textarea
                        id="description-direct"
                        placeholder="Brief description of the repository"
                        value={form.description}
                        onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                        rows={2}
                      />
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddRepository} 
                  disabled={isAdding || !isFormValid()}
                >
                  {isAdding ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Repository
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{data.repositories.length}</p>
              </div>
              <GitBranch className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Complete</p>
                <p className="text-2xl font-bold text-green-600">
                  {data.repositories.filter(r => r.docStatus === "complete").length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Partial</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {data.repositories.filter(r => r.docStatus === "partial").length}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Missing</p>
                <p className="text-2xl font-bold text-red-600">
                  {data.repositories.filter(r => r.docStatus === "missing").length}
                </p>
              </div>
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search repositories..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Repository List</CardTitle>
          <CardDescription>
            {filteredRepos.length} repositories found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Repository</TableHead>
                  <TableHead className="min-w-[120px]">Connection</TableHead>
                  <TableHead className="min-w-[150px]">Languages</TableHead>
                  <TableHead className="text-center">C4</TableHead>
                  <TableHead className="text-center">ADR</TableHead>
                  <TableHead className="text-center">OpenAPI</TableHead>
                  <TableHead className="text-center">AsyncAPI</TableHead>
                  <TableHead className="text-center">Context Map</TableHead>
                  <TableHead className="text-center">Data Catalog</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Last Analyzed</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredRepos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      No repositories found. Add a repository to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRepos.map((repo) => (
                    <TableRow key={repo.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedRepo(repo)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{repo.name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {repo.description || "No description"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {repo.connectionName ? (
                          <div className="flex items-center gap-1">
                            <span>{connectionTypeIcons[repo.connectionType || ""] || "🔗"}</span>
                            <span className="text-sm truncate max-w-[100px]">{repo.connectionName}</span>
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            <Globe className="mr-1 h-3 w-3" />
                            Direct URL
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {repo.languages.length > 0 ? (
                            repo.languages.map((lang) => getLanguageBadge(lang))
                          ) : (
                            <span className="text-xs text-muted-foreground">Not analyzed</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusIcon(repo.docTypes.c4 ? "complete" : "missing")}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusIcon(repo.docTypes.adr ? "complete" : "missing")}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusIcon(repo.docTypes.openapi ? "complete" : "missing")}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusIcon(repo.docTypes.asyncapi ? "complete" : "missing")}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusIcon(repo.docTypes.contextMap ? "complete" : "missing")}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusIcon(repo.docTypes.dataCatalog ? "complete" : "missing")}
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(repo.docStatus)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {repo.lastAnalyzedAt 
                          ? new Date(repo.lastAnalyzedAt).toLocaleDateString()
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                runAnalysis(repo.id);
                              }}
                              disabled={isAnalyzing}
                            >
                              <Play className="mr-2 h-4 w-4" />
                              {isAnalyzing ? "Analyzing..." : "Run Analysis"}
                            </DropdownMenuItem>
                            {/* Polish P2.3 — wire dropdown actions. */}
                            <DropdownMenuItem asChild>
                              <Link href={`/repositories/${repo.id}/runs`} onClick={(e) => e.stopPropagation()}>
                                <FileText className="mr-2 h-4 w-4" />
                                View runs &amp; documents
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/adr?repositoryId=${repo.id}`} onClick={(e) => e.stopPropagation()}>
                                <FileText className="mr-2 h-4 w-4" />
                                View ADRs
                              </Link>
                            </DropdownMenuItem>
                            {repo.connectionId && (
                              <DropdownMenuItem asChild>
                                <Link href={`/settings?connection=${repo.connectionId}`} onClick={(e) => e.stopPropagation()}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Edit connection
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {repo.connectionUrl && (
                              <DropdownMenuItem asChild>
                                <a
                                  href={repo.connectionUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Open in {repo.connectionName}
                                </a>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRepository(repo.id);
                              }}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Repository Detail Dialog */}
      <Dialog open={!!selectedRepo} onOpenChange={() => setSelectedRepo(null)}>
        <DialogContent className="max-w-2xl">
          {selectedRepo && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  {selectedRepo.name}
                </DialogTitle>
                <DialogDescription>
                  {selectedRepo.description || "No description available"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Connection</p>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedRepo.connectionName ? (
                        <>
                          <span>{connectionTypeIcons[selectedRepo.connectionType || ""] || "🔗"}</span>
                          <span className="font-medium">{selectedRepo.connectionName}</span>
                        </>
                      ) : (
                        <>
                          <Link2 className="h-4 w-4 text-blue-500" />
                          <span className="font-medium">Direct URL</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Languages</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedRepo.languages.length > 0 ? (
                        selectedRepo.languages.map((lang) => getLanguageBadge(lang))
                      ) : (
                        <span className="text-sm text-muted-foreground">Not yet analyzed</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Documentation Status</p>
                  <div className="flex flex-wrap gap-2">
                    {getDocTypeBadge(selectedRepo.docTypes.c4, "C4 Model")}
                    {getDocTypeBadge(selectedRepo.docTypes.adr, "ADR")}
                    {getDocTypeBadge(selectedRepo.docTypes.openapi, "OpenAPI")}
                    {getDocTypeBadge(selectedRepo.docTypes.asyncapi, "AsyncAPI")}
                    {getDocTypeBadge(selectedRepo.docTypes.contextMap, "Context Map")}
                    {getDocTypeBadge(selectedRepo.docTypes.dataCatalog, "Data Catalog")}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setSelectedRepo(null)}>
                    Close
                  </Button>
                  <Button
                    onClick={() => selectedRepo && runAnalysis(selectedRepo.id)}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {progress?.message || "Analyzing..."}
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Run Analysis
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
