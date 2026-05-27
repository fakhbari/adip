// Structured logging via Pino.
//
// Replaces ad-hoc `console.warn` / `console.error` calls across `src/lib/**`.
// One root logger; `.child({ component })` per call-site so log lines carry
// a stable component label without callers repeating themselves.
//
// In dev (NODE_ENV=development) the output is pretty-printed via
// `pino-pretty` if installed — otherwise it falls back to NDJSON (still
// readable in a terminal). In prod it is always NDJSON for log shippers.

import pino, { type Logger } from "pino";

const isDev = process.env.NODE_ENV === "development";

const baseOptions: pino.LoggerOptions = {
  name: "adip",
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  // Redact common secret-bearing fields wherever they accidentally leak.
  redact: {
    paths: [
      "accessToken",
      "apiKey",
      "password",
      "passwordHash",
      "*.accessToken",
      "*.apiKey",
      "*.password",
      "headers.authorization",
      "headers.cookie",
      'headers["x-internal-token"]',
    ],
    censor: "[REDACTED]",
  },
};

let _root: Logger | null = null;

function root(): Logger {
  if (_root) return _root;
  if (isDev) {
    try {
      // pino-pretty is optional; if absent we silently fall back to NDJSON.
      _root = pino({
        ...baseOptions,
        transport: { target: "pino-pretty", options: { colorize: true } },
      });
    } catch {
      _root = pino(baseOptions);
    }
  } else {
    _root = pino(baseOptions);
  }
  return _root;
}

/**
 * Get a child logger labelled with the given component name. Always prefer
 * `logger("vcs.github")` over `console.error("[github] …")` so log shippers
 * can pivot on the `component` field.
 */
export function logger(component: string): Logger {
  return root().child({ component });
}

/** Bare access to the root logger, e.g. for boot messages. */
export const log = root();

/**
 * Polish P6.2 — request-scoped tracing bindings.
 *
 * Bind once per request / per analysis run and pass the child logger down so
 * every structured line carries the same `requestId` / `analysisRunId` /
 * `repositoryId` / `tenantId`. After the run, the entire timeline filters
 * out of any log aggregator with a single `jq` expression.
 *
 *   const log = withRequestContext(logger("orchestrator"), {
 *     analysisRunId: "run_1234",
 *     repositoryId: "repo_42",
 *     tenantId: ctx.userId,
 *   });
 *   log.info("starting"); // → { ..., analysisRunId: "run_1234", ... }
 */
export type RequestContext = {
  requestId?: string;
  analysisRunId?: string;
  repositoryId?: string;
  tenantId?: string;
  agentType?: string;
};

export function withRequestContext(base: Logger, ctx: RequestContext): Logger {
  // Strip undefined fields so the binding does not produce `requestId: undefined`
  // in the output — Pino-pretty renders that as a literal "undefined" string.
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "string" && v.length > 0) cleaned[k] = v;
  }
  return base.child(cleaned);
}
