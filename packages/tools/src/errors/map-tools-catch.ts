import {
  AbortedError,
  HttpVendorError,
  MissingCredentialError,
  ParseVendorError,
  RateLimitedError,
  ValidationVendorError,
  type ToolsTag,
} from "./tagged-errors";

export function isToolsTag(error: unknown): error is ToolsTag {
  return (
    error instanceof RateLimitedError ||
    error instanceof HttpVendorError ||
    error instanceof ParseVendorError ||
    error instanceof MissingCredentialError ||
    error instanceof ValidationVendorError
  );
}

function isAbortLike(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? error.name : undefined;
  return name === "AbortError" || name === "TimeoutError";
}

/**
 * `Effect.tryPromise` catch mapper for Cap/tool Promise edges. Classification
 * is by class only, never by message text: vendor tags pass through, abort
 * signals rethrow as defects, and any other `Error` is a validation failure
 * carrying its message.
 */
export function mapToolsCatch(error: unknown): ToolsTag {
  if (isToolsTag(error)) return error;
  if (error instanceof AbortedError || isAbortLike(error)) throw error;
  if (error instanceof Error) {
    return new ValidationVendorError({ message: error.message });
  }
  throw error;
}
