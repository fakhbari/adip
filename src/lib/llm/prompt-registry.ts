// File-based prompt registry. Phase 2.2.
//
// Templates live under `prompts/<agent>/<task>.<locale>.md`. Loaded
// lazily; cached in-process. The `{{var}}` interpolator is deliberately
// minimal — no Handlebars, no conditionals; if a template needs more,
// build the string in the calling agent and inject the result via a
// single variable.
//
// Why files (not strings inline in the agent): SAW_102 conformance
// requires reviewers to read the prompts. A repo file + diff is the
// audit surface.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "@/lib/logger";

const log = logger("prompt-registry");

export type Locale = "en" | "fa";

const cache = new Map<string, string>();

const PROMPTS_ROOT = process.env.ADIP_PROMPTS_DIR
  ? path.resolve(process.env.ADIP_PROMPTS_DIR)
  : path.resolve(process.cwd(), "prompts");

function cacheKey(agent: string, task: string, locale: Locale): string {
  return `${agent}/${task}.${locale}`;
}

/** Load a raw template file. Falls back to the English variant when fa is missing. */
async function load(agent: string, task: string, locale: Locale): Promise<string> {
  const key = cacheKey(agent, task, locale);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const filePath = path.join(PROMPTS_ROOT, agent, `${task}.${locale}.md`);
  try {
    const text = await readFile(filePath, "utf8");
    cache.set(key, text);
    return text;
  } catch (err) {
    if (locale !== "en") {
      log.warn({ agent, task, locale }, "template missing; falling back to en");
      return load(agent, task, "en");
    }
    log.error({ agent, task, locale, filePath }, "template not found");
    throw new Error(`Prompt template not found: ${filePath}`);
  }
}

/**
 * Tiny `{{var}}` interpolator. Substitutions are applied in a single
 * pass so values containing `{{` cannot inject further templates.
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) return "";
    return v;
  });
}

export const PromptRegistry = {
  /** Get a rendered template. Throws if even the English variant is missing. */
  async render(args: {
    agent: string;
    task: string;
    locale?: Locale;
    vars?: Record<string, string>;
  }): Promise<string> {
    const tpl = await load(args.agent, args.task, args.locale ?? "fa");
    return interpolate(tpl, args.vars ?? {});
  },

  /** Test-only — flush the cache so vitest can swap templates between tests. */
  __resetCacheForTests(): void {
    cache.clear();
  },
};
