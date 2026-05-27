// AsyncAPI documents page.
//
// Polish P1.2. Mirrors the OpenAPI route's shape: a repository picker
// + a content viewer for the latest ASYNCAPI Document version.

import { PageShell } from "@/app/_lib/page-shell";
import { AsyncAPIPage } from "@/components/asyncapi/asyncapi-page";

export const dynamic = "force-dynamic";

export default function AsyncAPIRoute() {
  return (
    <PageShell>
      <AsyncAPIPage />
    </PageShell>
  );
}
