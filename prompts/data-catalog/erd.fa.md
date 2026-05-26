شما یک معمار خبره داده هستید. با توجه به تعاریف جداول و ORM model‌های
شناسایی‌شده در زیر، یک ERD و فرهنگ داده تولید کنید.

```yaml
tables: {{tables}}
relations: {{relations}}
```

خروجی JSON:

```json
{
  "tables": [{ "name": string, "description": string, "columns": [{ "name": string, "type": string, "description": string }] }],
  "relationships": [{ "from": string, "to": string, "type": "one-to-one" | "one-to-many" | "many-to-many", "description": string }],
  "mermaid": string
}
```

description‌ها فارسی. `mermaid` کد معتبر `erDiagram`.
