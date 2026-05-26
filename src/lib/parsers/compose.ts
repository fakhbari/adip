// docker-compose.yml parser. Phase 3.7.
//
// Surfaces services + their image + ports + depends_on so c4-agent
// can build Level 2 (Containers) from infrastructure-as-code instead
// of regex over filenames.

import yaml from "js-yaml";

export type ComposeService = {
  name: string;
  image?: string;
  build?: string;
  ports?: string[];
  environment?: Record<string, string>;
  depends_on?: string[];
  command?: string | string[];
};

export type ComposeFile = {
  services: ComposeService[];
};

export function parseCompose(content: string): ComposeFile {
  let doc: unknown;
  try {
    doc = yaml.load(content);
  } catch {
    return { services: [] };
  }
  if (!doc || typeof doc !== "object" || !("services" in doc)) return { services: [] };
  const rawServices = (doc as { services?: Record<string, unknown> }).services ?? {};

  const services: ComposeService[] = [];
  for (const [name, raw] of Object.entries(rawServices)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    services.push({
      name,
      image: typeof r.image === "string" ? r.image : undefined,
      build: typeof r.build === "string" ? r.build : (r.build && typeof r.build === "object" && "context" in r.build ? String((r.build as Record<string, unknown>).context) : undefined),
      ports: Array.isArray(r.ports) ? r.ports.map(String) : undefined,
      environment: Array.isArray(r.environment)
        ? Object.fromEntries(r.environment.map((p) => String(p).split("=")).filter((kv) => kv.length === 2) as [string, string][])
        : (r.environment && typeof r.environment === "object" ? (r.environment as Record<string, string>) : undefined),
      depends_on: Array.isArray(r.depends_on) ? r.depends_on.map(String) : (r.depends_on && typeof r.depends_on === "object" ? Object.keys(r.depends_on as Record<string, unknown>) : undefined),
      command: typeof r.command === "string" ? r.command : Array.isArray(r.command) ? r.command.map(String) : undefined,
    });
  }
  return { services };
}
