// Data Catalog page.
//
// Polish P1.3. Shows the latest DATA_CATALOG Document per repository.
// Mermaid `erDiagram` snippets render in-browser via the existing
// Mermaid setup (loaded by the c4 / context-map pages already).

import { PageShell } from "@/app/_lib/page-shell";
import { DataCatalogPage } from "@/components/data-catalog/data-catalog-page";

export const dynamic = "force-dynamic";

export default function DataCatalogRoute() {
  return (
    <PageShell>
      <DataCatalogPage />
    </PageShell>
  );
}
