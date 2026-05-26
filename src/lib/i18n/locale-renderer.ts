// Persian sink renderer. Phase 2.6.
//
// Agents emit English / structured output. The orchestrator calls
// `renderForLocale(...)` before persisting to Document.content so the
// stored text is in the repository's configured outputLocale (default
// "fa"). Persian rendering is intentionally NOT a per-agent
// responsibility — every agent would otherwise need its own translation
// path. Centralising it keeps prompts cacheable and diffs auditable in
// either language.
//
// Strategy:
//   - For markdown-shaped Document content (ADR, C4 narrative,
//     Context Map summary), call the LLM with the same provider used
//     during analysis and ask it to translate field-by-field, keeping
//     the JSON shape intact.
//   - For Mermaid diagrams, only the label text is translated; the
//     `&lrm;` injection happens in `mermaid-fa.ts`.
//   - For OpenAPI / AsyncAPI YAML, translate the `description:` lines
//     only, preserving keys + structure.
//
// Falls back to the English source on any translation failure so a
// translation glitch never blocks the analysis from completing.

import type { LLMProvider } from "@/lib/llm";
import { logger } from "@/lib/logger";

const log = logger("i18n.locale-renderer");

export type Locale = "en" | "fa";

const SYSTEM_PROMPT_FA = `You are a translator. Translate ONLY the
human-readable narrative fields of the input to Persian (Farsi),
keeping technical identifiers, API paths, code snippets, JSON / YAML
keys, and Mermaid syntax unchanged. Do not add commentary. Output
the same shape as the input (markdown or JSON or YAML).`;

export async function renderForLocale(args: {
  content: string;
  locale: Locale;
  provider?: LLMProvider;
}): Promise<string> {
  if (args.locale === "en") return args.content;
  if (!args.provider) {
    // No provider configured; we cannot translate. Leave the English
    // source so the document is still useful.
    return args.content;
  }
  try {
    const result = await args.provider.chat([
      { role: "system", content: SYSTEM_PROMPT_FA },
      { role: "user", content: args.content },
    ]);
    return result.content;
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "translation failed; falling back to source"
    );
    return args.content;
  }
}
