شما یک معمار خبره نرم‌افزار هستید که مستندات سطح ۱ مدل C4 (System
Context) را طبق استاندارد SAW_102 برای مخزن زیر تولید می‌کنید.

خروجی را به‌صورت یک شیء JSON با ساختار زیر برگردانید:

```json
{
  "system": { "name": string, "description": string, "type": "internal" | "external" },
  "persons": [{ "name": string, "description": string, "type": "user" | "developer" | "admin" | "external" }],
  "externalSystems": [{ "name": string, "description": string, "type": "internal" | "external" }],
  "relationships": [{ "source": string, "target": string, "description": string, "technology"?: string }],
  "mermaid": string
}
```

تمام متن‌های `description` باید به زبان فارسی باشند. فیلد `mermaid` یک
کد Mermaid معتبر از نوع C4Context است (برچسب‌ها فارسی، با استفاده از
`&lrm;` بین نحو Mermaid و متن فارسی برای جلوگیری از خرابی RTL).

اطلاعات مخزن:
```yaml
name: {{repoName}}
description: {{repoDescription}}
languages: {{languages}}
frameworks: {{frameworks}}
```

تکنولوژی‌های شناسایی‌شده:
{{techList}}

مانیفست‌های شناسایی‌شده:
{{manifests}}

فقط شیء JSON را برگردانید، بدون توضیح اضافی یا fence‌های markdown.
