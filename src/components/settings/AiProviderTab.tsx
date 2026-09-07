"use client";

import React, { useEffect, useState } from "react";
import {
  Key,
  Plus,
  Trash2,
  Edit,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
  Star,
  Server,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface AIProvider {
  id: string;
  name: string;
  type: "OPENAI" | "ANTHROPIC" | "AZURE_OPENAI" | "LOCAL_OLLAMA" | "CUSTOM";
  baseUrl: string | null;
  modelName: string;
  isActive: boolean;
  isDefault: boolean;
  maxTokens: number;
  temperature: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    repositories: number;
  };
}

interface AIProviderFormData {
  name: string;
  type: "OPENAI" | "ANTHROPIC" | "AZURE_OPENAI" | "LOCAL_OLLAMA" | "CUSTOM";
  apiKey: string;
  baseUrl: string;
  modelName: string;
  maxTokens: number;
  temperature: number;
  isDefault: boolean;
}

const initialFormData: AIProviderFormData = {
  name: "",
  type: "OPENAI",
  apiKey: "",
  baseUrl: "",
  modelName: "",
  maxTokens: 4096,
  temperature: 0.7,
  isDefault: false,
};

const providerTypeLabels: Record<string, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic (Claude)",
  AZURE_OPENAI: "Azure OpenAI",
  LOCAL_OLLAMA: "Local (Ollama)",
  CUSTOM: "Custom (OpenAI-compatible)",
};

const defaultModels: Record<string, string[]> = {
  OPENAI: ["gpt-4o", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"],
  ANTHROPIC: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
  AZURE_OPENAI: ["gpt-4o", "gpt-4-turbo", "gpt-35-turbo"],
  LOCAL_OLLAMA: ["llama3.1:70b", "llama3.1:8b", "qwen2.5:72b", "codellama:70b", "mistral:7b"],
  CUSTOM: [],
};

const defaultBaseUrls: Record<string, string> = {
  OPENAI: "https://api.openai.com/v1",
  ANTHROPIC: "https://api.anthropic.com/v1",
  AZURE_OPENAI: "",
  LOCAL_OLLAMA: "http://localhost:11434",
  CUSTOM: "",
};

export function AiProviderTab() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<AIProvider | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [formData, setFormData] = useState<AIProviderFormData>(initialFormData);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings/ai-providers");
      if (response.ok) {
        const data = await response.json();
        setProviders(data);
      }
    } catch (error) {
      console.error("Failed to fetch AI providers:", error);
      toast.error("Failed to fetch AI providers");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTypeChange = (type: string) => {
    const newType = type as AIProviderFormData["type"];
    setFormData((prev) => ({
      ...prev,
      type: newType,
      baseUrl: defaultBaseUrls[newType] || "",
      modelName: defaultModels[newType]?.[0] || "",
    }));
  };

  const handleAddProvider = async () => {
    if (!formData.name || !formData.modelName) {
      toast.error("Name and model name are required");
      return;
    }

    if (formData.type !== "LOCAL_OLLAMA" && !formData.apiKey) {
      toast.error("API key is required for this provider type");
      return;
    }

    if ((formData.type === "AZURE_OPENAI" || formData.type === "CUSTOM") && !formData.baseUrl) {
      toast.error("Base URL is required for this provider type");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/settings/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const newProvider = await response.json();
        setProviders((prev) => {
          // If this is the new default, unset other defaults
          if (newProvider.isDefault) {
            return prev.map((p) => ({ ...p, isDefault: false })).concat(newProvider);
          }
          return [...prev, newProvider];
        });
        setIsAddDialogOpen(false);
        setFormData(initialFormData);
        toast.success("AI provider added successfully");
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to add AI provider");
      }
    } catch (error) {
      console.error("Failed to add AI provider:", error);
      toast.error("Failed to add AI provider");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditProvider = async () => {
    if (!editingProvider) return;
    if (!formData.name || !formData.modelName) {
      toast.error("Name and model name are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/settings/ai-providers/${editingProvider.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const updatedProvider = await response.json();
        setProviders((prev) =>
          prev.map((p) => {
            if (updatedProvider.isDefault) {
              return p.id === updatedProvider.id ? updatedProvider : { ...p, isDefault: false };
            }
            return p.id === updatedProvider.id ? updatedProvider : p;
          })
        );
        setIsEditDialogOpen(false);
        setEditingProvider(null);
        setFormData(initialFormData);
        toast.success("AI provider updated successfully");
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to update AI provider");
      }
    } catch (error) {
      console.error("Failed to update AI provider:", error);
      toast.error("Failed to update AI provider");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProvider = async () => {
    if (!deletingProvider) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/settings/ai-providers/${deletingProvider.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setProviders((prev) => prev.filter((p) => p.id !== deletingProvider.id));
        setIsDeleteDialogOpen(false);
        setDeletingProvider(null);
        toast.success("AI provider deleted successfully");
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to delete AI provider");
      }
    } catch (error) {
      console.error("Failed to delete AI provider:", error);
      toast.error("Failed to delete AI provider");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetDefault = async (provider: AIProvider) => {
    try {
      const response = await fetch(`/api/settings/ai-providers/${provider.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });

      if (response.ok) {
        setProviders((prev) =>
          prev.map((p) => ({
            ...p,
            isDefault: p.id === provider.id,
          }))
        );
        toast.success(`${provider.name} set as default provider`);
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to set default provider");
      }
    } catch (error) {
      console.error("Failed to set default provider:", error);
      toast.error("Failed to set default provider");
    }
  };

  const handleTestProvider = async (provider: AIProvider) => {
    setTestingProviderId(provider.id);
    try {
      const response = await fetch(`/api/settings/ai-providers/${provider.id}/test`, {
        method: "POST",
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message, {
          description: `Latency: ${result.latency}ms${result.model ? ` | Model: ${result.model}` : ""}`,
        });
      } else {
        toast.error(result.message || "Connection test failed");
      }
    } catch (error) {
      console.error("Failed to test AI provider:", error);
      toast.error("Failed to test AI provider");
    } finally {
      setTestingProviderId(null);
    }
  };

  const openEditDialog = (provider: AIProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      type: provider.type,
      apiKey: "",
      baseUrl: provider.baseUrl || "",
      modelName: provider.modelName,
      maxTokens: provider.maxTokens,
      temperature: provider.temperature,
      isDefault: provider.isDefault,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (provider: AIProvider) => {
    setDeletingProvider(provider);
    setIsDeleteDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>AI Providers</CardTitle>
              <CardDescription>
                Configure AI providers for documentation generation and analysis
              </CardDescription>
            </div>

            {/* Add Provider Dialog */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Ai Provider
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Add AI Provider</DialogTitle>
                  <DialogDescription>
                    Configure a new AI provider for documentation generation
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                        id="name"
                        placeholder="e.g., Production Claude, Dev OpenAI"
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({...prev, name: e.target.value}))}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="type">Provider Type *</Label>
                    <Select value={formData.type} onValueChange={handleTypeChange}>
                      <SelectTrigger>
                        <SelectValue/>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(providerTypeLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(formData.type === "AZURE_OPENAI" || formData.type === "CUSTOM" || formData.type === "LOCAL_OLLAMA") && (
                      <div className="grid gap-2">
                        <Label htmlFor="baseUrl">Base URL *</Label>
                        <Input
                            id="baseUrl"
                            placeholder={formData.type === "LOCAL_OLLAMA" ? "http://localhost:11434" : "https://your-instance.openai.azure.com"}
                            value={formData.baseUrl}
                            onChange={(e) => setFormData((prev) => ({...prev, baseUrl: e.target.value}))}
                        />
                      </div>
                  )}

                  <div className="grid gap-2">
                    <Label htmlFor="apiKey">
                      API Key {formData.type === "LOCAL_OLLAMA" ? "(Optional)" : "*"}
                    </Label>
                    <div className="relative">
                      <Input
                          id="apiKey"
                          type={showApiKey ? "text" : "password"}
                          placeholder={formData.type === "LOCAL_OLLAMA" ? "Usually not needed for Ollama" : "Enter your API key"}
                          value={formData.apiKey}
                          onChange={(e) => setFormData((prev) => ({...prev, apiKey: e.target.value}))}
                          className="pr-10"
                      />
                      <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="modelName">Model Name *</Label>
                    {defaultModels[formData.type] && defaultModels[formData.type].length > 0 ? (
                        <Select
                            value={formData.modelName}
                            onValueChange={(value) => setFormData((prev) => ({...prev, modelName: value}))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a model"/>
                          </SelectTrigger>
                          <SelectContent>
                            {defaultModels[formData.type].map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                    ) : (
                        <Input
                            id="modelName"
                            placeholder="e.g., gpt-4o, claude-3-opus"
                            value={formData.modelName}
                            onChange={(e) => setFormData((prev) => ({...prev, modelName: e.target.value}))}
                        />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="maxTokens">Max Tokens</Label>
                      <Input
                          id="maxTokens"
                          type="number"
                          value={formData.maxTokens}
                          onChange={(e) => setFormData((prev) => ({
                            ...prev,
                            maxTokens: parseInt(e.target.value) || 4096
                          }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="temperature">Temperature</Label>
                      <Input
                          id="temperature"
                          type="number"
                          step="0.1"
                          min="0"
                          max="2"
                          value={formData.temperature}
                          onChange={(e) => setFormData((prev) => ({
                            ...prev,
                            temperature: parseFloat(e.target.value) || 0.7
                          }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="isDefault"
                        checked={formData.isDefault}
                        onChange={(e) => setFormData((prev) => ({...prev, isDefault: e.target.checked}))}
                        className="h-4 w-4"
                    />
                    <Label htmlFor="isDefault" className="font-normal">
                      Set as default provider for new repositories
                    </Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddProvider} disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Add Provider
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Edit Provider Dialog */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Edit AI Provider</DialogTitle>
                  <DialogDescription>
                    Update AI provider configuration
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-name">Name *</Label>
                    <Input
                        id="edit-name"
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({...prev, name: e.target.value}))}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-type">Provider Type</Label>
                    <Select value={formData.type} onValueChange={handleTypeChange}>
                      <SelectTrigger>
                        <SelectValue/>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(providerTypeLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(formData.type === "AZURE_OPENAI" || formData.type === "CUSTOM" || formData.type === "LOCAL_OLLAMA") && (
                      <div className="grid gap-2">
                        <Label htmlFor="edit-baseUrl">Base URL *</Label>
                        <Input
                            id="edit-baseUrl"
                            value={formData.baseUrl}
                            onChange={(e) => setFormData((prev) => ({...prev, baseUrl: e.target.value}))}
                        />
                      </div>
                  )}

                  <div className="grid gap-2">
                    <Label htmlFor="edit-apiKey">New API Key</Label>
                    <div className="relative">
                      <Input
                          id="edit-apiKey"
                          type={showApiKey ? "text" : "password"}
                          placeholder="Leave empty to keep current key"
                          value={formData.apiKey}
                          onChange={(e) => setFormData((prev) => ({...prev, apiKey: e.target.value}))}
                          className="pr-10"
                      />
                      <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Leave empty to keep the existing API key
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-modelName">Model Name *</Label>
                    {defaultModels[formData.type] && defaultModels[formData.type].length > 0 ? (
                        <Select
                            value={formData.modelName}
                            onValueChange={(value) => setFormData((prev) => ({...prev, modelName: value}))}
                        >
                          <SelectTrigger>
                            <SelectValue/>
                          </SelectTrigger>
                          <SelectContent>
                            {defaultModels[formData.type].map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                    ) : (
                        <Input
                            id="edit-modelName"
                            value={formData.modelName}
                            onChange={(e) => setFormData((prev) => ({...prev, modelName: e.target.value}))}
                        />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-maxTokens">Max Tokens</Label>
                      <Input
                          id="edit-maxTokens"
                          type="number"
                          value={formData.maxTokens}
                          onChange={(e) => setFormData((prev) => ({
                            ...prev,
                            maxTokens: parseInt(e.target.value) || 4096
                          }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-temperature">Temperature</Label>
                      <Input
                          id="edit-temperature"
                          type="number"
                          step="0.1"
                          min="0"
                          max="2"
                          value={formData.temperature}
                          onChange={(e) => setFormData((prev) => ({
                            ...prev,
                            temperature: parseFloat(e.target.value) || 0.7
                          }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="edit-isDefault"
                        checked={formData.isDefault}
                        onChange={(e) => setFormData((prev) => ({...prev, isDefault: e.target.checked}))}
                        className="h-4 w-4"
                    />
                    <Label htmlFor="edit-isDefault" className="font-normal">
                      Set as default provider
                    </Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleEditProvider} disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Save Changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-destructive">Delete AI Provider</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this AI provider?
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  {deletingProvider && (
                      <div className="p-4 rounded-lg bg-muted">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{deletingProvider.name}</p>
                          <Badge variant="outline">{providerTypeLabels[deletingProvider.type]}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{deletingProvider.modelName}</p>
                      </div>
                  )}
                  <p className="text-sm text-muted-foreground mt-4">
                    This action cannot be undone.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleDeleteProvider} disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Delete Provider
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>

          <div className="space-y-4">
            {providers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Key className="h-12 w-12 mx-auto mb-4 opacity-50"/>
                  <p className="text-muted-foreground">No AI providers configured</p>
                  <p className="text-sm text-muted-foreground">
                    Add an AI provider to start generating documentation
                  </p>
                </div>
            ) : (
                providers.map((provider) => (
                    <Card key={provider.id} className={provider.isDefault ? "border-primary" : ""}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div
                                className={`h-2 w-2 rounded-full ${provider.isActive ? "bg-green-500" : "bg-gray-400"}`}/>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{provider.name}</p>
                                {provider.isDefault && (
                                    <Badge variant="default" className="text-xs">
                                      <Star className="mr-1 h-3 w-3"/>
                                      Default
                                    </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {providerTypeLabels[provider.type]}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {provider.modelName}
                                {provider.baseUrl && ` • ${new URL(provider.baseUrl).hostname}`}
                              </p>
                              <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                <span>Max tokens: {provider.maxTokens}</span>
                                <span>Temperature: {provider.temperature}</span>
                                {provider._count && (
                                    <span>{provider._count.repositories} repositories</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!provider.isDefault && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSetDefault(provider)}
                                    title="Set as default"
                                >
                                  <Star className="h-4 w-4"/>
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleTestProvider(provider)}
                                disabled={testingProviderId === provider.id}
                            >
                              {testingProviderId === provider.id ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin"/>
                              ) : (
                                  <Zap className="mr-1 h-3 w-3"/>
                              )}
                              Test
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditDialog(provider)}
                            >
                              <Edit className="h-4 w-4"/>
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive"
                                onClick={() => openDeleteDialog(provider)}
                                disabled={provider._count?.repositories ? provider._count.repositories > 0 : false}
                            >
                              <Trash2 className="h-4 w-4"/>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                ))
            )}
          </div>
        </CardContent>
      </Card>
)
  ;
}
