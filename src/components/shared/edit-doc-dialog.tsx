"use client";

// Shared Edit dialog for a Document row. Polish P2.4.
//
// PATCH /api/documents/[id] appends a new version. The dialog is the
// minimum useful editor: a single textarea on the document content,
// optional title override, "Save (creates v{n+1})" submit button.

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { apiFetch, showApiError } from "@/lib/api-client";

export function EditDocDialog({
  open,
  onOpenChange,
  documentId,
  initialTitle,
  initialContent,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  documentId: string;
  initialTitle: string;
  initialContent: string;
  onSaved?: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await apiFetch<{ id: string; version: number }>(`/api/documents/${documentId}`, {
      method: "PATCH",
      json: { title, content },
    });
    if ("data" in res) {
      toast.success(`Saved as v${res.data.version}.`);
      onOpenChange(false);
      onSaved?.();
    } else {
      showApiError(res);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Content</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono text-xs h-96"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save as new version"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
