// Frontend API client.
//
// Polish Phase C (P3.1). Replaces the ~29 raw `fetch(...)` call sites
// across the dashboard with a single helper that:
//   - always checks `response.ok` before parsing JSON,
//   - parses JSON safely (catches non-JSON bodies),
//   - returns a tagged result so callers cannot accidentally treat an
//     error response as data,
//   - surfaces errors through `toast` (via the optional hook).
//
// The shape is deliberately small. Component code reads like:
//
//   const result = await apiFetch<MyType>("/api/...", { method: "POST", json: body });
//   if ("error" in result) {
//     showApiError(result);
//     return;
//   }
//   useResult(result.data);

"use client";

import { toast } from "sonner";

export type ApiOk<T> = { data: T };
export type ApiErr = { error: string; status: number; details?: unknown };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export type ApiFetchInit = Omit<RequestInit, "body"> & {
  /** Pass an object to be JSON-stringified; sets Content-Type automatically. */
  json?: unknown;
  /** Raw body when you really need it. */
  body?: BodyInit;
};

/**
 * Fetch + parse + tag in one helper. Never throws — the failure shape
 * is part of the return type so the type system forces callers to
 * handle both branches.
 */
export async function apiFetch<T = unknown>(
  input: RequestInfo | URL,
  init: ApiFetchInit = {}
): Promise<ApiResult<T>> {
  const { json, headers: hdrIn, ...rest } = init;

  const headers = new Headers(hdrIn ?? {});
  let body: BodyInit | undefined = init.body;
  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(input, { ...rest, headers, body });
  } catch (err) {
    return {
      error: "Network error — could not reach the server.",
      status: 0,
      details: err instanceof Error ? err.message : String(err),
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    let details: unknown;
    let message = `Request failed with status ${response.status}.`;
    if (isJson) {
      try {
        const parsed = (await response.json()) as { error?: string; details?: unknown };
        if (parsed?.error) message = parsed.error;
        details = parsed?.details;
      } catch {
        // Fall through to text below.
      }
    }
    if (!details) {
      try {
        details = await response.text();
      } catch {
        /* ignored */
      }
    }
    return { error: message, status: response.status, details };
  }

  // 2xx — parse JSON when the server advertised it; otherwise empty data.
  if (!isJson) {
    return { data: undefined as unknown as T };
  }
  try {
    const parsed = (await response.json()) as T;
    return { data: parsed };
  } catch (err) {
    return {
      error: "Server returned malformed JSON.",
      status: response.status,
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Toast helper for error branches. Use as:
 *   if ("error" in result) { showApiError(result); return; }
 *
 * 401 → "Please sign in again." (avoid revealing the route shape).
 * 403 → "You do not have permission for that."
 * 404 → "Not found."
 * 409 → server message verbatim (typical: "Already running" etc.).
 * 5xx → "Server error — try again. (request id will be in the logs)".
 */
export function showApiError(err: ApiErr): void {
  if (err.status === 0) {
    toast.error("Network error. Check your connection and try again.");
    return;
  }
  if (err.status === 401) {
    toast.error("Your session expired. Please sign in again.");
    return;
  }
  if (err.status === 403) {
    toast.error("You do not have permission for that action.");
    return;
  }
  if (err.status === 404) {
    toast.error("Not found.");
    return;
  }
  if (err.status >= 500) {
    toast.error("Server error — please try again in a moment.");
    return;
  }
  toast.error(err.error);
}
