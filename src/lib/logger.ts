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
