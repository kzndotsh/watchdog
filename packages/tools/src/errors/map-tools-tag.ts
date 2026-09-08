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
function parseRateLimitedMessage(message: string): {
  service: string;
  subject: string;
} {
  const match = /^(.+) rate-limited for (.+)$/.exec(message);
  if (match) {
    return { service: match[1], subject: match[2] };
  }
  return { service: "tools", subject: message };
}

function parseHttpErrorMessage(
  message: string,
  status: number
): { service: string } {
  const match = /^(.+) HTTP (\d+)$/.exec(message);
  if (match && Number(match[2]) === status) {
    return { service: match[1] };
  }
  return { service: "tools" };
}

function parseParseErrorMessage(message: string): {
  service: string;
  subject: string;
} {
  const match = /^(.+) response for (.+) was not a JSON object$/.exec(message);
  if (match) {
    return { service: match[1], subject: match[2] };
  }
  return { service: "tools", subject: message };
}

function parseMissingApiKeySlot(message: string): string {
  const match = /^(.+) required$/.exec(message);
  return match?.[1] ?? message;
}

function toolsErrorToTagged(error: ToolsError): ToolsTag {
  switch (error.code) {
    case "rate_limited": {
      const { service, subject } = parseRateLimitedMessage(error.message);
      return new RateLimitedError({ service, subject });
    }
    case "http_error": {
      const { service } = parseHttpErrorMessage(
        error.message,
        error.status ?? 0
      );
      return new HttpVendorError({
        service,
        status: error.status ?? 0,
      });
    }
    case "parse_error": {
      const { service, subject } = parseParseErrorMessage(error.message);
      return new ParseVendorError({ service, subject });
    }
    case "missing_api_key": {
      return new MissingCredentialError({
        slot: parseMissingApiKeySlot(error.message),
      });
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
