import {
  HttpVendorError,
  MissingCredentialError,
  ParseVendorError,
  RateLimitedError,
  ValidationVendorError,
  type ToolsTag,
} from "./tagged-errors";
import {
  httpToolsError,
  isToolsError,
  missingApiKey,
  parseToolsError,
  rateLimitedToolsError,
  validationToolsError,
  type ToolsError,
} from "./tools-error";

export function isToolsTag(error: unknown): error is ToolsTag {
  return (
    error instanceof RateLimitedError ||
    error instanceof HttpVendorError ||
    error instanceof ParseVendorError ||
    error instanceof MissingCredentialError ||
    error instanceof ValidationVendorError
  );
}

export function taggedToToolsError(error: ToolsTag): ToolsError {
  switch (error._tag) {
    case "RateLimitedError": {
      return rateLimitedToolsError(error.service, error.subject);
    }
    case "HttpVendorError": {
      return httpToolsError(
        `${error.service} API`,
        error.status,
        `${error.service} API ${error.status}`
      );
    }
    case "ParseVendorError": {
      return parseToolsError(error.service, error.subject);
    }
    case "MissingCredentialError": {
      return missingApiKey(error.slot);
    }
    case "ValidationVendorError": {
      return validationToolsError(error.message);
    }
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

/** Map a thrown `ToolsError` into the tagged family. `aborted` is not a tag. */
function toolsErrorToTagged(error: ToolsError): ToolsTag {
  switch (error.code) {
    case "rate_limited": {
      return new RateLimitedError({
        service: error.message,
        subject: error.message,
      });
    }
    case "http_error": {
      return new HttpVendorError({
        service: error.message,
        status: error.status ?? 0,
      });
    }
    case "parse_error": {
      return new ParseVendorError({
        service: "tools",
        subject: error.message,
      });
    }
    case "missing_api_key": {
      return new MissingCredentialError({ slot: error.message });
    }
    case "validation_error": {
      return new ValidationVendorError({ message: error.message });
    }
    default: {
      return new ValidationVendorError({ message: error.message });
    }
  }
}

/**
 * `Effect.tryPromise` catch mapper for Cap/tool Promise edges.
 * Typed vendor errors stay in `E`; abort/`ToolsError("aborted")` rethrow as defects.
 */
export function mapToolsCatch(error: unknown): ToolsTag {
  if (isToolsTag(error)) return error;
  if (isAbortLike(error)) throw error;
  if (isToolsError(error)) {
    if (error.code === "aborted") throw error;
    return toolsErrorToTagged(error);
  }
  if (error instanceof Error) {
    return new ValidationVendorError({ message: error.message });
  }
  throw error;
}

function isAbortLike(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? error.name : undefined;
  return name === "AbortError" || name === "TimeoutError";
}
