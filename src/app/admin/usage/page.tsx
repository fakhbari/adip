// Admin LLM usage page — Polish P1.8.

import { PageShell } from "@/app/_lib/page-shell";
import { LLMUsageView } from "@/components/admin/llm-usage-view";

export const dynamic = "force-dynamic";

export default function LLMUsagePage() {
  return (
    <PageShell requireRole="admin">
      <LLMUsageView />
    </PageShell>
  );
}
