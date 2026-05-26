import { describe, it, expect } from "vitest";
import { parseCompose } from "../../src/lib/parsers/compose";
import { parseK8sManifest } from "../../src/lib/parsers/k8s";

describe("parseCompose", () => {
  it("extracts services with image / ports / depends_on", () => {
    const yaml = `
services:
  web:
    image: nginx:1.27
    ports:
      - "8080:80"
    depends_on:
      - api
  api:
    build: ./api
    environment:
      - PORT=3000
`;
    const out = parseCompose(yaml);
    expect(out.services).toHaveLength(2);
    const web = out.services.find((s) => s.name === "web")!;
    expect(web.image).toBe("nginx:1.27");
    expect(web.depends_on).toEqual(["api"]);
    const api = out.services.find((s) => s.name === "api")!;
    expect(api.build).toBe("./api");
    expect(api.environment).toEqual({ PORT: "3000" });
  });

  it("returns empty services on malformed YAML", () => {
    expect(parseCompose("services: not-an-object").services).toEqual([]);
  });
});

describe("parseK8sManifest", () => {
  it("extracts workloads + services across multi-doc YAML", () => {
    const m = `
apiVersion: apps/v1
kind: Deployment
metadata: { name: api }
spec:
  template:
    spec:
      containers:
        - name: api
          image: myorg/api:1.0
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata: { name: api-svc }
spec:
  selector: { app: api }
  ports:
    - port: 80
      targetPort: 8080
`;
    const out = parseK8sManifest(m);
    expect(out.workloads).toHaveLength(1);
    expect(out.workloads[0].name).toBe("api");
    expect(out.workloads[0].containers[0].image).toBe("myorg/api:1.0");
    expect(out.services).toHaveLength(1);
    expect(out.services[0].name).toBe("api-svc");
  });
});
