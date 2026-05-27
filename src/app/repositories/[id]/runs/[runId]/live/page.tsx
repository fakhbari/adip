// Live log page — Polish P2.6.
//
// Renders the in-flight stream for one AnalysisRun:
//   left  → ordered RunEvent list (follow-tail).
//   right → live LLM delta stream.
//   bottom→ per-agent progress strip.
//
// Subscribes to `analysis:${runId}` for analysis-progress / agent-event /
// llm-delta. Falls back to polling the run-detail endpoint every 2s when
// the WS connection is down.

import { PageShell } from "@/app/_lib/page-shell";
import { LiveLogView } from "@/components/repositories/live-log-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; runId: string }> };

export default async function LiveLogPage({ params }: Props) {
  const { id, runId } = await params;
  return (
    <PageShell>
      <LiveLogView repositoryId={id} runId={runId} />
    </PageShell>
  );
}
