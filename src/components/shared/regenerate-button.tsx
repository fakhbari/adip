"use client";

// Regenerate button — Polish P2.4.
//
// Triggers an analysis run scoped to a single agent. Used by every
// doc viewer to re-create just that document type.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, showApiError } from "@/lib/api-client";

type AgentType = "tech-radar" | "c4" | "adr" | "openapi" | "asyncapi" | "data-catalog" | "context-map";

export function RegenerateButton({
  repositoryId,
  agentType,
  size = "sm",
  variant = "outline",
}: {
  repositoryId: string;
  agentType: AgentType;
  size?: "sm" | "default";
  variant?: "outline" | "default";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const regen = async () => {
    setBusy(true);
    const res = await apiFetch<{ analysisRunId: string }>(`/api/repositories/${repositoryId}/analysis`, {
      method: "POST",
      json: { enabledAgents: [agentType] },
    });
    if ("data" in res) {
      toast.success("Regeneration queued.");
      router.push(`/repositories/${repositoryId}/runs/${res.data.analysisRunId}/live`);
    } else {
      showApiError(res);
    }
    setBusy(false);
  };
  return (
    <Button size={size} variant={variant} onClick={regen} disabled={busy}>
      <RefreshCw className={`h-4 w-4 mr-1 ${busy ? "animate-spin" : ""}`} />
      {busy ? "Queuing…" : "Regenerate"}
    </Button>
  );
}
