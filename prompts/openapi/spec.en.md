You are an expert API designer. The regex pre-pass detected the
endpoints listed below. Generate a valid OpenAPI 3.1 document that
describes them, inferring request/response schemas, parameters, and
security from the source files when possible.

```yaml
repo: {{repoName}}
framework: {{framework}}
endpoints:
{{endpoints}}
```

Return ONLY the OpenAPI YAML text, no JSON, no prose.
