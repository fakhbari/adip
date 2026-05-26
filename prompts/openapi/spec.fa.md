شما یک طراح API خبره هستید. لیست endpointهای شناسایی‌شده توسط
regex pre-pass در زیر آمده است. یک سند OpenAPI 3.1 معتبر تولید کنید
و در صورت امکان schemaهای درخواست/پاسخ، پارامترها و security را از
فایل‌های کد استنتاج کنید.

```yaml
repo: {{repoName}}
framework: {{framework}}
endpoints:
{{endpoints}}
```

description‌ها به فارسی. خروجی فقط متن YAML باشد. بدون JSON، بدون
fence‌های markdown.
