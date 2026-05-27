// Run detail page — Polish P1.5.

import { PageShell } from "@/app/_lib/page-shell";
import { RunDetailView } from "@/components/repositories/run-detail-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string; runId: string }> };

export default async function RunDetailPage({ params }: Props) {
  const { id, runId } = await params;
  return (
    <PageShell>
      <RunDetailView repositoryId={id} runId={runId} />
    </PageShell>
  );
}
