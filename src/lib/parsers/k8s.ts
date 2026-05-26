// Kubernetes manifest parser. Phase 3.7.
//
// Supports Deployment / StatefulSet / Service / Ingress kinds across
// multi-document YAML files (the most common Helm rendered shape).
// Extracts container topology + service exposure so the C4 agent can
// describe inter-container communication in Level 2.

import yaml from "js-yaml";

export type K8sContainer = {
  name: string;
  image: string;
  ports?: { name?: string; containerPort?: number; protocol?: string }[];
};

export type K8sWorkload = {
  kind: "Deployment" | "StatefulSet" | "DaemonSet";
  name: string;
  containers: K8sContainer[];
};

export type K8sService = {
  name: string;
  selector?: Record<string, string>;
  ports?: { name?: string; port?: number; targetPort?: number | string; protocol?: string }[];
};

export type K8sIngress = {
  name: string;
  rules?: { host?: string; paths: { path?: string; serviceName?: string; servicePort?: number | string }[] }[];
};

export type K8sFile = {
  workloads: K8sWorkload[];
  services: K8sService[];
  ingresses: K8sIngress[];
};

export function parseK8sManifest(content: string): K8sFile {
  const docs: unknown[] = [];
  try {
    yaml.loadAll(content, (d) => docs.push(d));
  } catch {
    return { workloads: [], services: [], ingresses: [] };
  }

  const workloads: K8sWorkload[] = [];
  const services: K8sService[] = [];
  const ingresses: K8sIngress[] = [];

  for (const d of docs) {
    if (!d || typeof d !== "object") continue;
    const obj = d as { kind?: string; metadata?: { name?: string }; spec?: unknown };
    const kind = obj.kind ?? "";
    const name = obj.metadata?.name ?? "(unnamed)";

    if (kind === "Deployment" || kind === "StatefulSet" || kind === "DaemonSet") {
      const spec = obj.spec as { template?: { spec?: { containers?: Array<{ name?: string; image?: string; ports?: unknown[] }> } } } | undefined;
      const containers = spec?.template?.spec?.containers ?? [];
      workloads.push({
        kind,
        name,
        containers: containers.map((c) => ({
          name: c.name ?? "(unnamed)",
          image: c.image ?? "",
          ports: Array.isArray(c.ports) ? (c.ports as K8sContainer["ports"]) : undefined,
        })),
      });
    } else if (kind === "Service") {
      const spec = obj.spec as { selector?: Record<string, string>; ports?: K8sService["ports"] } | undefined;
      services.push({ name, selector: spec?.selector, ports: spec?.ports });
    } else if (kind === "Ingress") {
      const spec = obj.spec as { rules?: Array<{ host?: string; http?: { paths?: Array<{ path?: string; backend?: { service?: { name?: string; port?: { number?: number; name?: string } } } }> } }> } | undefined;
      const rules = (spec?.rules ?? []).map((r) => ({
        host: r.host,
        paths: (r.http?.paths ?? []).map((p) => ({
          path: p.path,
          serviceName: p.backend?.service?.name,
          servicePort: p.backend?.service?.port?.number ?? p.backend?.service?.port?.name,
        })),
      }));
      ingresses.push({ name, rules });
    }
  }

  return { workloads, services, ingresses };
}
