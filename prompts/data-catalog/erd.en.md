You are an expert data architect. Given the table definitions and ORM
models detected below, produce an ERD plus a data dictionary.

```yaml
tables: {{tables}}
relations: {{relations}}
```

Return JSON:

```json
{
  "tables": [{ "name": string, "description": string, "columns": [{ "name": string, "type": string, "description": string }] }],
  "relationships": [{ "from": string, "to": string, "type": "one-to-one" | "one-to-many" | "many-to-many", "description": string }],
  "mermaid": string
}
```

`mermaid` is a valid Mermaid `erDiagram` block.
