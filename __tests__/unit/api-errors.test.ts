import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { mapErrorToResponse, withErrorHandler } from "../../src/lib/api-errors";
import { NextResponse } from "next/server";

async function bodyOf(res: NextResponse) {
  return (await res.json()) as { error: string; code?: string; details?: unknown; requestId?: string };
}

describe("mapErrorToResponse", () => {
  it("maps Prisma P2002 to 409 with friendly target message", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "x",
      meta: { target: ["email"] },
    });
    const res = mapErrorToResponse(err);
    expect(res.status).toBe(409);
    const body = await bodyOf(res);
    expect(body.code).toBe("CONFLICT");
    expect(body.error).toContain("email");
  });

  it("maps Prisma P2025 to 404", async () => {
    const err = new Prisma.PrismaClientKnownRequestError("missing", {
      code: "P2025",
      clientVersion: "x",
    });
    const res = mapErrorToResponse(err);
    expect(res.status).toBe(404);
    expect((await bodyOf(res)).code).toBe("NOT_FOUND");
  });

  it("maps Zod errors to 400 with issues", async () => {
    const Schema = z.object({ name: z.string() });
    const parsed = Schema.safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const res = mapErrorToResponse(parsed.error);
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.details)).toBe(true);
  });

  it("maps SyntaxError 'JSON' to 400", async () => {
    const res = mapErrorToResponse(new SyntaxError("Unexpected token in JSON at position 0"));
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).code).toBe("INVALID_JSON");
  });

  it("maps AnalysisAlreadyRunningError to 409 with existingRunId", async () => {
    const err = Object.assign(new Error("running"), {
      name: "AnalysisAlreadyRunningError",
      existingRunId: "run-99",
    });
    const res = mapErrorToResponse(err);
    expect(res.status).toBe(409);
    const body = await bodyOf(res);
    expect(body.code).toBe("ANALYSIS_ALREADY_RUNNING");
    expect((body.details as { existingRunId: string }).existingRunId).toBe("run-99");
  });

  it("maps unknown errors to 500 and includes a requestId", async () => {
    const res = mapErrorToResponse(new Error("kaboom"));
    expect(res.status).toBe(500);
    const body = await bodyOf(res);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(typeof body.requestId).toBe("string");
    // The raw message must NEVER leak.
    expect(body.error).not.toContain("kaboom");
  });

  it("never echoes the raw error.message for non-Error throwables either", async () => {
    const res = mapErrorToResponse("connection string=postgres://secret");
    expect(res.status).toBe(500);
    const body = await bodyOf(res);
    expect(body.error).not.toContain("postgres");
  });
});

describe("withErrorHandler", () => {
  it("returns the handler's response on success", async () => {
    const wrapped = withErrorHandler(async () => NextResponse.json({ ok: true }));
    const res = await wrapped();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("converts thrown errors via mapErrorToResponse", async () => {
    const wrapped = withErrorHandler(async () => {
      throw new Error("oops");
    });
    const res = await wrapped();
    expect(res.status).toBe(500);
    const body = await bodyOf(res);
    expect(body.error).toBe("Internal server error.");
  });
});
