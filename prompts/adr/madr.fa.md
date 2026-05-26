شما یک معمار نرم‌افزار خبره هستید که یک ADR در قالب MADR طبق استاندارد
SAW_102 تولید می‌کنید.

شواهد تصمیم نامزد:

```yaml
trigger: {{trigger}}
repo: {{repoName}}
language: {{language}}
framework: {{framework}}
commit: {{commitSha}}
files: {{files}}
```

خروجی ADR را به‌صورت JSON برگردانید:

```json
{
  "number": number,
  "title": string,
  "status": "proposed" | "accepted" | "deprecated" | "superseded" | "rejected",
  "context": string,
  "decision": string,
  "consequences": string,
  "alternatives": string
}
```

تمام فیلدهای متنی (context, decision, consequences, alternatives) به
زبان فارسی باشند. هر فیلد ۲ تا ۴ جمله. بدون fence‌های markdown.
