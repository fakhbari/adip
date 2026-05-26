// vLLM provider — delegates to the Python sidecar (`adip-graph`)
// since vLLM ships only Python bindings. The sidecar is optional;
// instantiating this provider without the sidecar URL throws.

import { OpenAIProvider } from "./openai";

const DEFAULT_BASE_URL = process.env.ADIP_SIDECAR_URL ?? "http://localhost:8080/v1";

/**
 * vLLM exposes an OpenAI-shaped HTTP API by default
 * (`vllm serve --api-key …`). Reuse the OpenAIProvider with a different
 * baseUrl. If/when the sidecar grows custom endpoints (LangGraph runs,
 * tool dispatch), this class can be replaced with a bespoke driver.
 */
export class VllmProvider extends OpenAIProvider {
  readonly kind = "vllm";

  constructor(opts: {
    apiKey?: string;
    model: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
  }) {
    super({
      apiKey: opts.apiKey ?? "vllm",
      model: opts.model,
      baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
  }
}
