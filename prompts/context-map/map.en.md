You are an expert in Domain-Driven Design. Given the bounded contexts
and inter-context signals detected below, identify each context's
domain type and classify relationships using DDD patterns (OHS, ACL,
Conformist, Partnership, Shared Kernel, Customer-Supplier, Separate
Ways).

```yaml
contexts: {{contexts}}
signals: {{signals}}
```

Return JSON:

```json
{
  "contexts": [{ "name": string, "domainType": "core" | "supporting" | "generic", "description": string }],
  "relationships": [{ "source": string, "target": string, "pattern": string, "description": string }],
  "mermaid": string
}
```

`mermaid` is a valid Mermaid `graph TB` diagram source.
