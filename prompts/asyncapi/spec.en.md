You are an expert event-driven architect. The regex pre-pass detected
the message-broker topics / queues / channels listed below. Generate a
valid AsyncAPI 3.0 document describing them.

```yaml
repo: {{repoName}}
brokers: {{brokers}}
channels:
{{channels}}
```

Return ONLY the AsyncAPI YAML text.
