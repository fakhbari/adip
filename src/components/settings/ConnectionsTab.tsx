import React, {useState} from 'react';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription, DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Edit, GitBranch, Loader2, Plus, Trash2} from "lucide-react";
import {Label} from "@/components/ui/label";
import {Input} from "@/components/ui/input";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Badge} from "@/components/ui/badge";
import {toast} from "sonner";
import {RepositoryConnection} from "@/app/types/types";

const ConnectionsTab = (props) => {
    const [isAddConnectionOpen, setIsAddConnectionOpen] = useState(false);
    const [newConnection, setNewConnection] = useState({
        name: "",
        type: "gitlab",
        url: "",
        accessToken: "",
    });
    // Delete connection state
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [editingConnection, setEditingConnection] = useState<RepositoryConnection | null>(null);
    const [deletingConnection, setDeletingConnection] = useState<RepositoryConnection | null>(null);
    const [editConnectionData, setEditConnectionData] = useState({
        name: "",
        type: "gitlab" as "bitbucket" | "gitlab" | "github",
        url: "",
        accessToken: "",
    });
    // Edit connection state
    const [isUpdating, setIsUpdating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Open delete confirmation dialog
    const openDeleteDialog = (connection: RepositoryConnection) => {
        setDeletingConnection(connection);
        setIsDeleteDialogOpen(true);
    };

    const [isEditConnectionOpen, setIsEditConnectionOpen] = useState(false);
    const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null);

    const handleAddConnection = async () => {
        try {
            const response = await fetch("/api/settings/connections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newConnection),
            });
            if (response.ok) {
                const result = await response.json();
                props.setData((prev) => ({
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
                    props.setData(settingsData);
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
                props.setData((prev) => ({
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

    // Handle delete connection
    const handleDeleteConnection = async () => {
        if (!deletingConnection) return;

        setIsDeleting(true);
        try {
            const response = await fetch(`/api/settings/connections/${deletingConnection.id}`, {
                method: "DELETE",
            });

            if (response.ok) {
                props.setData((prev) => ({
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

    return (
        <>
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
                        {props.data?.connections.map((connection) => (
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

                        {props.data?.connections.length === 0 && (
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
        </>
    );
};

export default ConnectionsTab;