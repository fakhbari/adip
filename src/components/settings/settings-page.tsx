"use client";

import { useEffect, useState, useRef } from "react";
import {
  Settings as SettingsIcon,
  GitBranch,
  Clock,
  Bell,
  Key,
  Server,
  Save,
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Radar,
  Upload,
  Download,
  FileJson,
  Loader2,
  Info,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { AIProvidersTab } from "./ai-providers-tab";

interface RepositoryConnection {
  id: string;
  name: string;
  type: "bitbucket" | "gitlab" | "github";
  url: string;
  isActive: boolean;
  lastSync: Date | null;
}

interface ScheduleConfig {
  id: string;
  name: string;
  type: string;
  cronExpression: string;
  isActive: boolean;
  lastRun: Date | null;
  nextRun: Date | null;
}

interface Settings {
  aiProvider: string;
  apiKey: string;
  notifications: {
    email: boolean;
    slack: boolean;
    teams: boolean;
  };
}

interface SettingsData {
  connections: RepositoryConnection[];
  schedules: ScheduleConfig[];
  settings: Settings;
}

interface ExternalRadarImport {
  source: "thoughtworks" | "gartner";
  lastImport: Date | null;
  technologyCount: number;
  version: string | null;
}

interface ImportResult {
  success: boolean;
  added: number;
  updated: number;
  technologies: string[];
  errors: string[];
  version?: string;
}

export function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isAddConnectionOpen, setIsAddConnectionOpen] = useState(false);
  const [newConnection, setNewConnection] = useState({
    name: "",
    type: "gitlab",
    url: "",
    accessToken: "",
  });

  // External Radar Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importSource, setImportSource] = useState<"thoughtworks" | "gartner">("thoughtworks");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [externalRadarStatus, setExternalRadarStatus] = useState<ExternalRadarImport[]>([
    { source: "thoughtworks", lastImport: null, technologyCount: 0, version: null },
    { source: "gartner", lastImport: null, technologyCount: 0, version: null },
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/settings");
        const result = await response.json();
        setData(result);
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // Fetch external radar status on mount
  useEffect(() => {
    const fetchExternalRadarStatus = async () => {
      try {
        const response = await fetch("/api/settings/external-radar/import");
        if (response.ok) {
          const status = await response.json();
          setExternalRadarStatus([
            {
              source: "thoughtworks",
              lastImport: status.thoughtworks?.lastImport || null,
              technologyCount: status.thoughtworks?.technologyCount || 0,
              version: status.thoughtworks?.version || null,
            },
            {
              source: "gartner",
              lastImport: status.gartner?.lastImport || null,
              technologyCount: status.gartner?.technologyCount || 0,
              version: status.gartner?.version || null,
            },
          ]);
        }
      } catch (error) {
        console.error("Failed to fetch external radar status:", error);
      }
    };

    fetchExternalRadarStatus();
  }, []);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data?.settings),
      });
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddConnection = async () => {
    try {
      const response = await fetch("/api/settings/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConnection),
      });
      if (response.ok) {
        const result = await response.json();
        setData((prev) => ({
          ...prev!,
          connections: [...prev!.connections, result],
        }));
        setIsAddConnectionOpen(false);
        setNewConnection({ name: "", type: "gitlab", url: "", accessToken: "" });
      }
    } catch (error) {
      console.error("Failed to add connection:", error);
    }
  };

  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null);

  // Edit connection state
  const [isEditConnectionOpen, setIsEditConnectionOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<RepositoryConnection | null>(null);
  const [editConnectionData, setEditConnectionData] = useState({
    name: "",
    type: "gitlab" as "bitbucket" | "gitlab" | "github",
    url: "",
    accessToken: "",
  });
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete connection state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingConnection, setDeletingConnection] = useState<RepositoryConnection | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleTestConnection = async (connectionId: string) => {
    setTestingConnectionId(connectionId);
    try {
      const response = await fetch(`/api/settings/connections/${connectionId}/test`, {
        method: "POST",
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message, {
          description: result.details?.publicAccess
            ? "Limited access - no API token provided"
            : result.details?.user
              ? `Connected as: ${result.details.user}`
              : undefined,
        });
        // Refresh connection data
        const settingsResponse = await fetch("/api/settings");
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          setData(settingsData);
        }
      } else {
        toast.error(result.message || "Connection test failed");
      }
    } catch (error) {
      console.error("Failed to test connection:", error);
      toast.error("Failed to test connection");
    } finally {
      setTestingConnectionId(null);
    }
  };

  // Open edit dialog with connection data
  const openEditDialog = (connection: RepositoryConnection) => {
    setEditingConnection(connection);
    setEditConnectionData({
      name: connection.name,
      type: connection.type,
      url: connection.url,
      accessToken: "",
    });
    setIsEditConnectionOpen(true);
  };

  // Handle edit connection
  const handleEditConnection = async () => {
    if (!editingConnection) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/settings/connections/${editingConnection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editConnectionData),
      });

      if (response.ok) {
        const updatedConnection = await response.json();
        setData((prev) => ({
          ...prev!,
          connections: prev!.connections.map((c) =>
            c.id === editingConnection.id
              ? { ...c, name: updatedConnection.name, type: updatedConnection.type, url: updatedConnection.url }
              : c
          ),
        }));
        setIsEditConnectionOpen(false);
        setEditingConnection(null);
        toast.success("Connection updated successfully");
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to update connection");
      }
    } catch (error) {
      console.error("Failed to update connection:", error);
      toast.error("Failed to update connection");
    } finally {
      setIsUpdating(false);
    }
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (connection: RepositoryConnection) => {
    setDeletingConnection(connection);
    setIsDeleteDialogOpen(true);
  };

  // Handle delete connection
  const handleDeleteConnection = async () => {
    if (!deletingConnection) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/settings/connections/${deletingConnection.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setData((prev) => ({
          ...prev!,
          connections: prev!.connections.filter((c) => c.id !== deletingConnection.id),
        }));
        setIsDeleteDialogOpen(false);
        setDeletingConnection(null);
        toast.success("Connection deleted successfully");
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to delete connection");
      }
    } catch (error) {
      console.error("Failed to delete connection:", error);
      toast.error("Failed to delete connection");
    } finally {
      setIsDeleting(false);
    }
  };

  // External Radar Import handlers
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast.error("Please upload a JSON file");
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);

      const response = await fetch("/api/settings/external-radar/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: importSource,
          data: jsonData,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setImportResult(result);
        toast.success(`Successfully imported ${result.added + result.updated} technologies from ${importSource}`);

        // Update status
        setExternalRadarStatus((prev) =>
          prev.map((s) =>
            s.source === importSource
              ? {
                  ...s,
                  lastImport: new Date(),
                  technologyCount: result.added + result.updated,
                  version: result.version || null,
                }
              : s
          )
        );
      } else {
        toast.error(result.error || "Failed to import external radar data");
        setImportResult({ success: false, added: 0, updated: 0, technologies: [], errors: [result.error || "Import failed"] });
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to parse JSON file");
      setImportResult({ success: false, added: 0, updated: 0, technologies: [], errors: ["Invalid JSON format"] });
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const downloadTemplate = (source: "thoughtworks" | "gartner") => {
    const template = {
      version: source === "thoughtworks" ? "29" : "2024-Q4",
      date: new Date().toISOString().split("T")[0],
      technologies: [
        {
          name: "Example Technology",
          quadrant: source === "thoughtworks" ? "languages-frameworks" : "Software Engineering",
          ring: source === "thoughtworks" ? "adopt" : "Mainstream",
          category: "Framework",
          description: "Description of the technology",
          is_new: false,
        },
      ],
    };

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${source}-radar-template.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Template downloaded for ${source}`);
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
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Configure ADIP system settings and integrations
          </p>
        </div>
        <Button onClick={handleSaveSettings} disabled={isSaving}>
          {isSaving ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="connections" className="space-y-4">
        <TabsList>
          <TabsTrigger value="connections">
            <GitBranch className="mr-2 h-4 w-4" />
            Connections
          </TabsTrigger>
          <TabsTrigger value="external-radars">
            <Radar className="mr-2 h-4 w-4" />
            External Radars
          </TabsTrigger>
          <TabsTrigger value="scheduler">
            <Clock className="mr-2 h-4 w-4" />
            Scheduler
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Key className="mr-2 h-4 w-4" />
            AI Provider
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="mr-2 h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Repository Connections */}
        <TabsContent value="connections">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Repository Connections</CardTitle>
                  <CardDescription>
                    Configure connections to your Git repositories
                  </CardDescription>
                </div>
                <Dialog open={isAddConnectionOpen} onOpenChange={setIsAddConnectionOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Connection
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Repository Connection</DialogTitle>
                      <DialogDescription>
                        Connect to a Git server to analyze repositories
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Connection Name</Label>
                        <Input
                          value={newConnection.name}
                          onChange={(e) => setNewConnection({ ...newConnection, name: e.target.value })}
                          placeholder="e.g., Internal GitLab"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select
                          value={newConnection.type}
                          onValueChange={(value) => setNewConnection({ ...newConnection, type: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gitlab">GitLab</SelectItem>
                            <SelectItem value="bitbucket">Bitbucket</SelectItem>
                            <SelectItem value="github">GitHub</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Server URL</Label>
                        <Input
                          value={newConnection.url}
                          onChange={(e) => setNewConnection({ ...newConnection, url: e.target.value })}
                          placeholder="https://gitlab.company.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Access Token</Label>
                        <Input
                          type="password"
                          value={newConnection.accessToken}
                          onChange={(e) => setNewConnection({ ...newConnection, accessToken: e.target.value })}
                          placeholder="Enter your access token"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddConnectionOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddConnection}>Add Connection</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data?.connections.map((connection) => (
                  <div
                    key={connection.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-2 w-2 rounded-full ${connection.isActive ? "bg-green-500" : "bg-gray-400"}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{connection.name}</p>
                          <Badge variant="outline">{connection.type.toUpperCase()}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{connection.url}</p>
                        {connection.lastSync && (
                          <p className="text-xs text-muted-foreground">
                            Last sync: {new Date(connection.lastSync).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(connection.id)}
                        disabled={testingConnectionId === connection.id}
                      >
                        {testingConnectionId === connection.id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : null}
                        Test
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openEditDialog(connection)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-destructive"
                        onClick={() => openDeleteDialog(connection)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {data?.connections.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No connections configured</p>
                    <p className="text-sm">Add a Git server connection to get started</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Edit Connection Dialog */}
          <Dialog open={isEditConnectionOpen} onOpenChange={setIsEditConnectionOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Repository Connection</DialogTitle>
                <DialogDescription>
                  Update connection settings
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Connection Name</Label>
                  <Input
                    value={editConnectionData.name}
                    onChange={(e) => setEditConnectionData({ ...editConnectionData, name: e.target.value })}
                    placeholder="e.g., Internal GitLab"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={editConnectionData.type}
                    onValueChange={(value) => setEditConnectionData({ ...editConnectionData, type: value as "bitbucket" | "gitlab" | "github" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gitlab">GitLab</SelectItem>
                      <SelectItem value="bitbucket">Bitbucket</SelectItem>
                      <SelectItem value="github">GitHub</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Server URL</Label>
                  <Input
                    value={editConnectionData.url}
                    onChange={(e) => setEditConnectionData({ ...editConnectionData, url: e.target.value })}
                    placeholder="https://gitlab.company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>New Access Token</Label>
                  <Input
                    type="password"
                    value={editConnectionData.accessToken}
                    onChange={(e) => setEditConnectionData({ ...editConnectionData, accessToken: e.target.value })}
                    placeholder="Leave empty to keep current token"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to keep the existing access token
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditConnectionOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleEditConnection} disabled={isUpdating}>
                  {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-destructive">Delete Connection</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this connection?
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                {deletingConnection && (
                  <div className="p-4 rounded-lg bg-muted">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{deletingConnection.name}</p>
                      <Badge variant="outline">{deletingConnection.type.toUpperCase()}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{deletingConnection.url}</p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-4">
                  This action cannot be undone. All repositories associated with this connection will also be removed.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDeleteConnection} disabled={isDeleting}>
                  {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete Connection
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* External Radars Import */}
        <TabsContent value="external-radars">
          <div className="grid gap-6">
            {/* Import Status Cards */}
            <div className="grid gap-4 md:grid-cols-2">
              {externalRadarStatus.map((radar) => (
                <Card key={radar.source}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Radar className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg capitalize">{radar.source} Radar</CardTitle>
                      </div>
                      {radar.lastImport && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Connected
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Technologies:</span>
                        <span className="font-medium">{radar.technologyCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Import:</span>
                        <span className="font-medium">
                          {radar.lastImport ? new Date(radar.lastImport).toLocaleString() : "Never"}
                        </span>
                      </div>
                      {radar.version && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Version:</span>
                          <span className="font-medium">{radar.version}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Import Card */}
            <Card>
              <CardHeader>
                <CardTitle>Import External Radar Data</CardTitle>
                <CardDescription>
                  Upload JSON files from ThoughtWorks Technology Radar or Gartner to compare with your organization&apos;s technology stack
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Source Selection */}
                <div className="space-y-2">
                  <Label>Import Source</Label>
                  <Select
                    value={importSource}
                    onValueChange={(value) => setImportSource(value as "thoughtworks" | "gartner")}
                  >
                    <SelectTrigger className="w-full md:w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="thoughtworks">ThoughtWorks Technology Radar</SelectItem>
                      <SelectItem value="gartner">Gartner Hype Cycle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* File Upload */}
                <div className="space-y-2">
                  <Label>Upload JSON File</Label>
                  <div className="flex flex-col gap-4 md:flex-row md:items-end">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="radar-file-upload"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImporting}
                      className="w-full md:w-auto"
                    >
                      {isImporting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {isImporting ? "Importing..." : "Choose JSON File"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => downloadTemplate(importSource)}
                      className="w-full md:w-auto"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Template
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Supported formats: JSON. Maximum file size: 10MB
                  </p>
                </div>

                {/* Import Result */}
                {importResult && (
                  <Alert variant={importResult.success ? "default" : "destructive"} className={importResult.success ? "border-green-200 bg-green-50" : ""}>
                    <div className="flex items-start gap-2">
                      {importResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <AlertTitle>{importResult.success ? "Import Successful" : "Import Failed"}</AlertTitle>
                        <AlertDescription className="mt-2">
                          {importResult.success ? (
                            <div className="space-y-2">
                              <p>Added: {importResult.added} technologies</p>
                              <p>Updated: {importResult.updated} technologies</p>
                              {importResult.technologies.length > 0 && (
                                <div className="mt-2">
                                  <p className="font-medium text-sm">Technologies imported:</p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {importResult.technologies.slice(0, 20).map((tech) => (
                                      <Badge key={tech} variant="outline" className="text-xs">
                                        {tech}
                                      </Badge>
                                    ))}
                                    {importResult.technologies.length > 20 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{importResult.technologies.length - 20} more
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <ul className="list-disc list-inside space-y-1">
                              {importResult.errors.map((error, idx) => (
                                <li key={idx}>{error}</li>
                              ))}
                            </ul>
                          )}
                        </AlertDescription>
                      </div>
                    </div>
                  </Alert>
                )}

                {/* JSON Format Guide */}
                <Card className="bg-muted/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Expected JSON Format
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-background p-3 rounded-md overflow-x-auto">
{`{
  "version": "29",
  "date": "2024-01-15",
  "technologies": [
    {
      "name": "React",
      "quadrant": "languages-frameworks",
      "ring": "adopt",  // adopt, trial, assess, hold
      "category": "Framework",
      "description": "UI component library",
      "is_new": false
    }
  ]
}`}
                    </pre>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            {/* How to Get Data */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">How to Get External Radar Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    ThoughtWorks Technology Radar
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Download the radar data from ThoughtWorks website or use AI tools to extract data from their PDF reports.
                    The data should include technology names, rings (Adopt, Trial, Assess, Hold), and quadrants.
                  </p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    Gartner Hype Cycle
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Extract technology data from Gartner Hype Cycle reports. Use AI tools to parse PDF reports and convert
                    to JSON format. Include technology names and their positions on the hype cycle.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Scheduler */}
        <TabsContent value="scheduler">
          <Card>
            <CardHeader>
              <CardTitle>Schedule Configuration</CardTitle>
              <CardDescription>
                Configure automated documentation generation schedules
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {data?.schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-4">
                      <Switch checked={schedule.isActive} />
                      <div>
                        <p className="font-medium">{schedule.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Cron: {schedule.cronExpression}
                        </p>
                        {schedule.nextRun && (
                          <p className="text-xs text-muted-foreground">
                            Next run: {new Date(schedule.nextRun).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Provider */}
        <TabsContent value="ai">
          <AIProvidersTab />
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>
                Configure how you receive alerts and updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive documentation updates via email
                  </p>
                </div>
                <Switch
                  checked={data?.settings.notifications.email}
                  onCheckedChange={(checked) =>
                    setData((prev) => ({
                      ...prev!,
                      settings: {
                        ...prev!.settings,
                        notifications: { ...prev!.settings.notifications, email: checked },
                      },
                    }))
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Slack Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Post updates to Slack channels
                  </p>
                </div>
                <Switch
                  checked={data?.settings.notifications.slack}
                  onCheckedChange={(checked) =>
                    setData((prev) => ({
                      ...prev!,
                      settings: {
                        ...prev!.settings,
                        notifications: { ...prev!.settings.notifications, slack: checked },
                      },
                    }))
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Microsoft Teams</Label>
                  <p className="text-sm text-muted-foreground">
                    Post updates to Teams channels
                  </p>
                </div>
                <Switch
                  checked={data?.settings.notifications.teams}
                  onCheckedChange={(checked) =>
                    setData((prev) => ({
                      ...prev!,
                      settings: {
                        ...prev!.settings,
                        notifications: { ...prev!.settings.notifications, teams: checked },
                      },
                    }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
