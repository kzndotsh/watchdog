/** JSON-serializable values for jsonb columns + wire types. */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = Record<string, JsonValue>;

/** Shallow guard: a non-null, non-array object (not a recursive JsonValue check). */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `JSON.parse` is typed `any`; its output space is always `JsonValue` by
 * construction (it throws `SyntaxError` on anything outside that grammar).
 */
export function parseJsonValue(text: string): JsonValue {
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON.parse only ever returns valid JSON or throws
    return JSON.parse(text) as JsonValue;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) throw error;
    throw new SyntaxError("Invalid JSON input", { cause: error });
  }
}
