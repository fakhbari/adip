// LLM pricing table.
//
// Polish P1.8. Vendor-published $-per-1M-token rates for the providers
// we ship adapters for. Conservative defaults: prefer the lower-priced
// "input" rate for prompt tokens and the "output" rate for completion.
// Missing models render "—" in the usage dashboard — never an error.
//
// Update on a quarterly cadence; the table is small and version-control
// gives us a clean rollback if a vendor moves prices mid-period.

export type RateUsd = { inputPerMTok: number; outputPerMTok: number };

const RATES: Record<string, RateUsd> = {
  // Anthropic
  "anthropic:claude-opus-4-7": { inputPerMTok: 15, outputPerMTok: 75 },
  "anthropic:claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "anthropic:claude-haiku-4-5-20251001": { inputPerMTok: 0.25, outputPerMTok: 1.25 },
  // OpenAI (rounded to public public)
  "openai:gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
  "openai:gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  "openai:gpt-4-turbo": { inputPerMTok: 10, outputPerMTok: 30 },
  "openai:gpt-3.5-turbo": { inputPerMTok: 0.5, outputPerMTok: 1.5 },
  // OSS / self-hosted — assume zero $-per-token; the user pays GPU cost.
  "ollama:default": { inputPerMTok: 0, outputPerMTok: 0 },
  "vllm:default": { inputPerMTok: 0, outputPerMTok: 0 },
};

/**
 * Look up the rate for a (provider, model) pair. Returns null when we
 * have no entry — callers MUST render that as "—" rather than $0.
 */
export function rateFor(provider: string, model: string): RateUsd | null {
  const key = `${provider}:${model}`;
  if (RATES[key]) return RATES[key];
  // For OSS providers we don't expect every model to be listed, fall back
  // to the provider default.
  if (provider === "ollama" || provider === "vllm") return RATES[`${provider}:default`] ?? null;
  return null;
}

/**
 * Compute USD cost for one usage record. Returns null when rates are
 * unknown so the caller can surface that the cell is not just $0.
 */
export function costUsd(provider: string, model: string, promptTokens: number, completionTokens: number): number | null {
  const r = rateFor(provider, model);
  if (!r) return null;
  return (promptTokens / 1_000_000) * r.inputPerMTok + (completionTokens / 1_000_000) * r.outputPerMTok;
}
