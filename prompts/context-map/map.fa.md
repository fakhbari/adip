شما یک متخصص Domain-Driven Design هستید. با توجه به bounded contextها
و سیگنال‌های بین‌متنی شناسایی‌شده در زیر، domain type هر context را
تعیین کرده و روابط را بر اساس الگوهای DDD (OHS, ACL, Conformist,
Partnership, Shared Kernel, Customer-Supplier, Separate Ways)
طبقه‌بندی کنید.

```yaml
contexts: {{contexts}}
signals: {{signals}}
```

خروجی JSON:

```json
{
  "contexts": [{ "name": string, "domainType": "core" | "supporting" | "generic", "description": string }],
  "relationships": [{ "source": string, "target": string, "pattern": string, "description": string }],
  "mermaid": string
}
```

description‌ها فارسی. `mermaid` کد معتبر `graph TB` با برچسب‌های
فارسی و `&lrm;` در صورت نیاز.
