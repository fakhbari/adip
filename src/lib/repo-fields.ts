// Helpers for the JSON-shaped String columns on `Repository`.
//
// `languages` and `frameworks` are stored as JSON-encoded `String?` (a Prisma
// limitation of the SQLite provider — see schema.prisma). Several routes used
// to call `JSON.parse` inline with no try/catch, so a corrupt blob crashed
// the endpoint. Centralise the validation here.

import { z } from "zod";

const StringArraySchema = z.array(z.string());

/**
 * Parse a JSON-encoded `string[]` column. Returns `[]` on null/empty or any
 * decode/shape error. Logs a warning so the bad row is visible — but never
 * throws, so callers can iterate over the result unconditionally.
 */
export function parseJsonStringArray(raw: string | null | undefined, fieldName: string): string[] {
  if (raw === null || raw === undefined || raw === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`repo-fields: ${fieldName} is not valid JSON — returning [].`, err);
    return [];
  }
  const result = StringArraySchema.safeParse(parsed);
  if (!result.success) {
    console.warn(`repo-fields: ${fieldName} JSON shape is unexpected — returning [].`);
    return [];
  }
  return result.data;
}

export function parseLanguages(row: { languages: string | null | undefined }): string[] {
  return parseJsonStringArray(row.languages, "languages");
}

export function parseFrameworks(row: { frameworks: string | null | undefined }): string[] {
  return parseJsonStringArray(row.frameworks, "frameworks");
}

/**
 * Convenience: encode a `string[]` to the column shape. Returns null when
 * the input is empty — matches the schema's `String?` semantics.
 */
export function serializeJsonStringArray(values: string[] | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  return JSON.stringify(values);
}
