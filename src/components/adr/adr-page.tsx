"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  GitBranch,
  Calendar,
  User,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";

interface ADR {
  id: string;
  number: number;
  title: string;
  status: "PROPOSED" | "ACCEPTED" | "DEPRECATED" | "SUPERSEDED" | "REJECTED";
  repositoryName: string;
  context: string;
  decision: string;
  consequences: string | null;
  alternatives: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ADRData {
  adrs: ADR[];
  stats: {
    total: number;
    proposed: number;
    accepted: number;
    deprecated: number;
  };
  repositories: { id: string; name: string }[];
}

const statusColors: Record<string, string> = {
  PROPOSED: "bg-yellow-500/10 text-yellow-600 border-yellow-200",
  ACCEPTED: "bg-green-500/10 text-green-600 border-green-200",
  DEPRECATED: "bg-gray-500/10 text-gray-600 border-gray-200",
  SUPERSEDED: "bg-blue-500/10 text-blue-600 border-blue-200",
  REJECTED: "bg-red-500/10 text-red-600 border-red-200",
};

export function ADRPage() {
  const [data, setData] = useState<ADRData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedADR, setSelectedADR] = useState<ADR | null>(null);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    repositoryId: "",
    title: "",
    context: "",
    decision: "",
  });

  useEffect(() => {
    const fetchADRs = async () => {
      try {
        const response = await fetch("/api/adr");
        const result = await response.json();
        setData(result);
      } catch (error) {
        console.error("Failed to fetch ADRs:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchADRs();
  }, []);

  const filteredADRs = data?.adrs.filter((adr) => {
    const matchesSearch = search === "" ||
      adr.title.toLowerCase().includes(search.toLowerCase()) ||
      adr.repositoryName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || adr.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const handleGenerateADR = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/adr/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generateForm),
      });
      if (response.ok) {
        setIsGenerateOpen(false);
        // Refresh ADRs
        const adrsResponse = await fetch("/api/adr");
        const result = await adrsResponse.json();
        setData(result);
      }
    } catch (error) {
      console.error("Failed to generate ADR:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAIGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/adr/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryId: generateForm.repositoryId }),
      });
      if (response.ok) {
        const result = await response.json();
        setGenerateForm({
          ...generateForm,
          title: result.title,
          context: result.context,
          decision: result.decision,
        });
      }
    } catch (error) {
      console.error("Failed to AI generate ADR:", error);
    } finally {
      setIsGenerating(false);
    }
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
          <h1 className="text-2xl font-bold tracking-tight">Architecture Decision Records</h1>
          <p className="text-muted-foreground">
            Document and track architectural decisions across your repositories
          </p>
        </div>
        <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New ADR
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Architecture Decision Record</DialogTitle>
              <DialogDescription>
                Document an architectural decision for a repository
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label>Repository</Label>
                  <Select
                    value={generateForm.repositoryId}
                    onValueChange={(value) => setGenerateForm({ ...generateForm, repositoryId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {data?.repositories.map((repo) => (
                        <SelectItem key={repo.id} value={repo.id}>
                          {repo.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleAIGenerate}
                  disabled={!generateForm.repositoryId || isGenerating}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI Generate from Repository Analysis
                </Button>

                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={generateForm.title}
                    onChange={(e) => setGenerateForm({ ...generateForm, title: e.target.value })}
                    placeholder="e.g., Use PostgreSQL as Primary Database"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Context</Label>
                  <Textarea
                    value={generateForm.context}
                    onChange={(e) => setGenerateForm({ ...generateForm, context: e.target.value })}
                    placeholder="Describe the context and problem statement..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Decision</Label>
                  <Textarea
                    value={generateForm.decision}
                    onChange={(e) => setGenerateForm({ ...generateForm, decision: e.target.value })}
                    placeholder="Describe the decision made..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsGenerateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleGenerateADR} disabled={isGenerating}>
                {isGenerating ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Create ADR
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total ADRs</p>
                <p className="text-2xl font-bold">{data?.stats.total || 0}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Proposed</p>
                <p className="text-2xl font-bold text-yellow-600">{data?.stats.proposed || 0}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Accepted</p>
                <p className="text-2xl font-bold text-green-600">{data?.stats.accepted || 0}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Deprecated</p>
                <p className="text-2xl font-bold text-gray-600">{data?.stats.deprecated || 0}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-gray-500" />
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
                placeholder="Search ADRs..."
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
                <SelectItem value="PROPOSED">Proposed</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="DEPRECATED">Deprecated</SelectItem>
                <SelectItem value="SUPERSEDED">Superseded</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ADR List */}
      <div className="grid gap-4 lg:grid-cols-2">
        {filteredADRs.map((adr) => (
          <Card
            key={adr.id}
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setSelectedADR(adr)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="text-muted-foreground">ADR-{adr.number.toString().padStart(4, "0")}</span>
                    <span>{adr.title}</span>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    <GitBranch className="h-3 w-3" />
                    {adr.repositoryName}
                  </CardDescription>
                </div>
                <Badge className={statusColors[adr.status]}>{adr.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2">{adr.context}</p>
              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(adr.createdAt).toLocaleDateString()}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ADR Detail Dialog */}
      <Dialog open={!!selectedADR} onOpenChange={() => setSelectedADR(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {selectedADR && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      ADR-{selectedADR.number.toString().padStart(4, "0")}
                    </span>
                    {selectedADR.title}
                  </DialogTitle>
                  <Badge className={statusColors[selectedADR.status]}>
                    {selectedADR.status}
                  </Badge>
                </div>
                <DialogDescription className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  {selectedADR.repositoryName}
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="context" className="mt-4">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="context">Context</TabsTrigger>
                  <TabsTrigger value="decision">Decision</TabsTrigger>
                  <TabsTrigger value="consequences">Consequences</TabsTrigger>
                  <TabsTrigger value="alternatives">Alternatives</TabsTrigger>
                </TabsList>

                <TabsContent value="context" className="mt-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{selectedADR.context}</ReactMarkdown>
                  </div>
                </TabsContent>

                <TabsContent value="decision" className="mt-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{selectedADR.decision}</ReactMarkdown>
                  </div>
                </TabsContent>

                <TabsContent value="consequences" className="mt-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {selectedADR.consequences ? (
                      <ReactMarkdown>{selectedADR.consequences}</ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground">No consequences documented.</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="alternatives" className="mt-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {selectedADR.alternatives ? (
                      <ReactMarkdown>{selectedADR.alternatives}</ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground">No alternatives documented.</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                <Button variant="outline" onClick={() => setSelectedADR(null)}>
                  Close
                </Button>
                <Button variant="outline">
                  <GitBranch className="mr-2 h-4 w-4" />
                  View in Git
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
