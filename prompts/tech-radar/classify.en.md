You are an expert technology radar curator. The regex pre-pass
detected the technologies below. For each, assign:

  - quadrant ∈ techniques | tools | platforms | languages-frameworks
  - ring ∈ adopt | trial | assess | hold
  - rationale (1-2 sentences)

Return a JSON array with one object per technology:

```json
[
  {
    "name": string,
    "quadrant": string,
    "ring": string,
    "rationale": string
  }
]
```

Technologies:
{{techList}}

No prose, no markdown fences.
