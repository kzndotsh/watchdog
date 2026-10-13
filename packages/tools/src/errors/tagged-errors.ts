import { Data } from "effect";

/*
 * Vendor failure tags. Each carries a stable, unique `code` and derives its
 * `message` from its own fields; nothing ever parses a message back into a
 * tag. Core maps each tag into its own taxonomy by tag name
 * (`toDomainTag` in `@watchdog/core/jobs`).
 */
export class RateLimitedError extends Data.TaggedError("RateLimitedError")<{
  readonly service: string;
  readonly subject: string;
  readonly retryAfterMs?: number;
}> {
  readonly code = "rate_limited" as const;

  override get message(): string {
    return `${this.service} rate-limited for ${this.subject}`;
  }
}

export class HttpVendorError extends Data.TaggedError("HttpVendorError")<{
  readonly service: string;
  readonly status: number;
  /** Vendor-specific text that replaces the default message. */
  readonly detail?: string;
}> {
  readonly code = "vendor_http" as const;

  override get message(): string {
    return this.detail ?? `${this.service} HTTP ${this.status}`;
  }
}

export class ParseVendorError extends Data.TaggedError("ParseVendorError")<{
  readonly service: string;
  readonly subject: string;
  /** Vendor-specific text that replaces the default message. */
  readonly detail?: string;
}> {
  readonly code = "vendor_parse" as const;

  override get message(): string {
    return (
      this.detail ??
      `${this.service} response for ${this.subject} was not a JSON object`
    );
  }
}

export class MissingCredentialError extends Data.TaggedError(
  "MissingCredentialError"
)<{
  readonly slot: string;
}> {
  readonly code = "missing_credential" as const;

  override get message(): string {
    return `${this.slot} required`;
  }
}

/**
 * Input the caller can fix (bad URL, missing field). `message` reaches
 * clients through `InvalidError`, so it must be a fixed, safe sentence: never
 * build it from upstream, driver or model text. Put that detail in `cause`,
 * which is for logs only.
 */
export class ValidationVendorError extends Data.TaggedError(
  "ValidationVendorError"
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {
  readonly code = "vendor_validation" as const;
}

/**
 * A tool failed in a way nobody classified (network, driver, runtime). It is
 * a server fault, not caller input: core maps it to `InternalError`. The
 * original error is `cause` (logs only); the message is fixed.
 */
export class UnexpectedToolError extends Data.TaggedError(
  "UnexpectedToolError"
)<{
  readonly cause: unknown;
}> {
  readonly code = "tool_unexpected" as const;

  override readonly message = "Tool failed unexpectedly";
}

export type ToolsTag =
  | RateLimitedError
  | HttpVendorError
  | ParseVendorError
  | MissingCredentialError
  | ValidationVendorError
  | UnexpectedToolError;

/**
 * Cooperative cancellation. Not part of `ToolsTag`: it is never a typed
 * failure, so `mapToolsCatch` rethrows it and it surfaces as a defect.
 */
export class AbortedError extends Data.TaggedError("AbortedError")<{
  readonly message: string;
}> {
  readonly code = "aborted" as const;
}
