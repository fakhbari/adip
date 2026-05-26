// Backend error envelope + Prisma error mapping.
//
// Polish Phase C (P3.2). Every API route catch block goes through
// `mapErrorToResponse(err)`. The response body NEVER contains the
// underlying `error.message` (Postgres errors can carry connection
// strings, schema names, etc.). Instead we log the full error with a
// per-request `requestId` and return a sanitized shape.
//
// Specific mappings:
//   - Prisma `P2002` (unique constraint) → 409 with a friendly target
//     hint (the violated field, when available).
//   - Prisma `P2025` (record not found) → 404.
//   - `SyntaxError` from JSON.parse / request.json() → 400 with
//     "Invalid JSON body".
//   - `ZodError` → 400 with the `issues` array (the issues themselves
//     are safe — they refer to caller-provided keys).
//   - `AnalysisAlreadyRunningError` → 409 + the existing run id
//     (already-known caller-facing shape).
//   - everything else → 500 with a server-side requestId.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";

const log = logger("api-errors");

/**
 * Project-specific named error types we want to map to a non-500
 * status. Add new ones here when they appear; the route catch sites
 * stay unchanged.
 */
export type NamedError =
  | { name: "AnalysisAlreadyRunningError"; existingRunId: string }
  | { name: "VCSError"; provider: string; status: number; operation: string };

function isNamedError(err: unknown): err is { name: string } & Record<string, unknown> {
  return typeof err === "object" && err !== null && "name" in err && typeof (err as { name: unknown }).name === "string";
}

/**
 * The canonical error response body. Every catch block produces this
 * shape so the frontend `apiFetch` knows what to do.
 */
export type ErrorBody = {
  error: string;
  /** Stable code; useful for i18n on the frontend later. */
  code?: string;
  /** Validation issues etc — only present when safe to show. */
  details?: unknown;
  /** UUID written into the log line for correlation. */
  requestId?: string;
};

export function mapErrorToResponse(err: unknown): NextResponse<ErrorBody> {
  // Prisma errors.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = Array.isArray(err.meta?.target) ? (err.meta!.target as string[]).join(", ") : undefined;
      log.warn({ code: err.code, target }, "unique-constraint violation");
      return NextResponse.json(
        {
          error: target ? `A record with this ${target} already exists.` : "A record with that key already exists.",
          code: "CONFLICT",
        },
        { status: 409 }
      );
    }
    if (err.code === "P2025") {
      log.warn({ code: err.code, meta: err.meta }, "row not found");
      return NextResponse.json({ error: "Not found.", code: "NOT_FOUND" }, { status: 404 });
    }
  }

  // Zod validation.
  if (err instanceof ZodError) {
    log.warn({ issues: err.issues }, "zod validation failed");
    return NextResponse.json(
      { error: "Invalid input.", code: "VALIDATION_ERROR", details: err.issues },
      { status: 400 }
    );
  }

  // JSON.parse / request.json() syntax errors.
  if (err instanceof SyntaxError && err.message.toLowerCase().includes("json")) {
    return NextResponse.json({ error: "Invalid JSON body.", code: "INVALID_JSON" }, { status: 400 });
  }

  // Named project errors.
  if (isNamedError(err)) {
    if (err.name === "AnalysisAlreadyRunningError") {
      return NextResponse.json(
        {
          error: "An analysis is already running for this repository.",
          code: "ANALYSIS_ALREADY_RUNNING",
          details: { existingRunId: err.existingRunId as string },
        },
        { status: 409 }
      );
    }
    if (err.name === "VCSError") {
      const status = (err.status as number) ?? 502;
      return NextResponse.json(
        {
          error: `Upstream VCS error (${err.provider}).`,
          code: "VCS_ERROR",
          details: { operation: err.operation, status },
        },
        { status: status === 401 || status === 403 ? 502 : status >= 500 ? 502 : 400 }
      );
    }
  }

  // Fallthrough — log with a requestId, return generic 500.
  const requestId = randomUUID();
  log.error(
    {
      requestId,
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
    },
    "unhandled API error"
  );
  return NextResponse.json(
    {
      error: "Internal server error.",
      code: "INTERNAL_ERROR",
      requestId,
    },
    { status: 500 }
  );
}

/**
 * Convenience for routes that just want to wrap their handler:
 *
 *   export const POST = withErrorHandler(async (req, params) => {
 *     // ... business logic
 *     return NextResponse.json({ data });
 *   });
 *
 * The handler signature is intentionally the same as the underlying
 * Next.js route handler so it can drop in.
 */
export function withErrorHandler<Args extends unknown[], R extends NextResponse<unknown>>(
  handler: (...args: Args) => Promise<R>
): (...args: Args) => Promise<R | NextResponse<ErrorBody>> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      return mapErrorToResponse(err);
    }
  };
}
