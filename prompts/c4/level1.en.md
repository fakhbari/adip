You are an expert software architect generating SAW_102-compliant C4
Level 1 (System Context) documentation for the repository below.

Output the result as a single JSON object with this shape:

```json
{
  "system": { "name": string, "description": string, "type": "internal" | "external" },
  "persons": [{ "name": string, "description": string, "type": "user" | "developer" | "admin" | "external" }],
  "externalSystems": [{ "name": string, "description": string, "type": "internal" | "external" }],
  "relationships": [{ "source": string, "target": string, "description": string, "technology"?: string }],
  "mermaid": string
}
```

The `mermaid` field is a valid Mermaid C4Context diagram source.

Repository:
```yaml
name: {{repoName}}
description: {{repoDescription}}
languages: {{languages}}
frameworks: {{frameworks}}
```

Detected technologies (from the regex pre-pass):
{{techList}}

Detected manifests (Docker / k8s / Helm — may be empty):
{{manifests}}

Return ONLY the JSON object, no prose, no markdown fences.
