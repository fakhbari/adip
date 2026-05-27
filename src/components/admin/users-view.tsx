"use client";

// Users admin view — Polish P1.6.
//
// Lists every user with role + active state. Invite creates a row + a
// one-time temporary password we show the admin verbatim (they hand it
// to the invitee; we never email passwords). Per-row: toggle active,
// switch role between admin / user.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, UserPlus } from "lucide-react";
import { apiFetch, showApiError } from "@/lib/api-client";

type User = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export function UsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "user">("user");
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ users: User[] }>("/api/admin/users");
    if ("data" in res) setUsers(res.data.users);
    else showApiError(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const invite = async () => {
    if (!inviteEmail) {
      toast.error("Email is required.");
      return;
    }
    const res = await apiFetch<{ user: User; tempPassword: string }>("/api/admin/users", {
      method: "POST",
      json: { email: inviteEmail, name: inviteName || undefined, role: inviteRole },
    });
    if ("data" in res) {
      setTempPassword(res.data.tempPassword);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("user");
      void load();
    } else {
      showApiError(res);
    }
  };

  const toggleActive = async (u: User) => {
    const res = await apiFetch<{ user: User }>(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      json: { isActive: !u.isActive },
    });
    if ("data" in res) {
      toast.success(u.isActive ? "User deactivated." : "User reactivated.");
      void load();
    } else {
      showApiError(res);
    }
  };

  const changeRole = async (u: User, role: "admin" | "user") => {
    const res = await apiFetch<{ user: User }>(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      json: { role },
    });
    if ("data" in res) {
      toast.success("Role updated.");
      void load();
    } else {
      showApiError(res);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Invite
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{users.length} users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Active</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2 pr-4">{u.name ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <Select value={u.role} onValueChange={(v) => changeRole(u, v as "admin" | "user")}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">admin</SelectItem>
                          <SelectItem value="user">user</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={u.isActive ? "default" : "secondary"}>{u.isActive ? "active" : "inactive"}</Badge>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="py-2 pr-4">
                      <Button size="sm" variant="outline" onClick={() => toggleActive(u)}>
                        {u.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setTempPassword(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
          </DialogHeader>
          {tempPassword ? (
            <div className="space-y-3">
              <p className="text-sm">User created. Share this one-time password with them now — it is not shown again:</p>
              <pre className="rounded bg-muted p-3 font-mono text-sm select-all">{tempPassword}</pre>
              <Button onClick={() => { setInviteOpen(false); setTempPassword(null); }}>Done</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Input placeholder="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              <Input placeholder="name (optional)" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "user")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button onClick={invite}>Create</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
