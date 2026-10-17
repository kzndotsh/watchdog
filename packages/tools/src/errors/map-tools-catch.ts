import {
  AbortedError,
  BlockedTargetError,
  HttpVendorError,
  MissingCredentialError,
  OutboundLimitError,
  ParseVendorError,
  RateLimitedError,
  UnexpectedToolError,
  ValidationVendorError,
  type ToolsTag,
} from "./tagged-errors";

export function isToolsTag(error: unknown): error is ToolsTag {
  return (
    error instanceof RateLimitedError ||
    error instanceof HttpVendorError ||
    error instanceof ParseVendorError ||
    error instanceof MissingCredentialError ||
    error instanceof ValidationVendorError ||
    error instanceof BlockedTargetError ||
    error instanceof OutboundLimitError ||
    error instanceof UnexpectedToolError
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
 * signals rethrow as defects, and any other `Error` is an unexpected tool
 * fault (a server fault, kept as `cause`). Caller-input problems must be thrown
 * as `ValidationVendorError` by the tool itself.
 */
export function mapToolsCatch(error: unknown): ToolsTag {
  if (isToolsTag(error)) return error;
  if (error instanceof AbortedError || isAbortLike(error)) throw error;
  if (error instanceof Error) {
    return new UnexpectedToolError({ cause: error });
  }
  throw error;
}
