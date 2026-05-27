// Run history page — Polish P1.4.

import { PageShell } from "@/app/_lib/page-shell";
import { RunHistoryView } from "@/components/repositories/run-history-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function RunHistoryPage({ params }: Props) {
  const { id } = await params;
  return (
    <PageShell>
      <RunHistoryView repositoryId={id} />
    </PageShell>
  );
}
