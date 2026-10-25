import { Data } from "effect";

/** The one user-facing text for an unclassified failure, including a transport failure and a name that resolved to a refused address. */
export const GENERIC_REQUEST_FAILURE = "Tool failed unexpectedly";

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

  override readonly message = GENERIC_REQUEST_FAILURE;
}

/** Why the outbound client refused a request target before connecting. */
export type BlockedTargetReason =
  | "scheme"
  | "host"
  | "address"
  | "resolved"
  | "proxy"
  | "unproxied"
  | "redirect"
  | "undeclared"
  | "seed"
  | "ai_origin";

/**
 * The outbound client refused to connect: the target is not a public http(s)
 * endpoint (scheme, host name, or a resolved address outside the allowed
 * ranges). The caller can pick another target, so core maps it to
 * `InvalidError`, except the server-side reasons (`resolved`, `proxy`,
 * `unproxied`), which core maps to `InternalError`. The message is fixed per
 * reason and never echoes the URL. `resolved` (a host name that resolved to a
 * refused address) shares its text with any other transport failure, so a
 * response does not reveal how a name resolves; the specific reason stays in
 * `reason` for logs. `undeclared` (a host the Cap never declared) and `seed` (a download
 * request carrying the Job's input) are declaration bugs, not caller input: core maps them
 * to `InternalError`. Nothing raises them yet; the policy that does is a later change.
 * `ai_origin` (a model endpoint the Job may not reach: unparsable, or private and not listed in
 * `WD_AI_PRIVATE_ORIGINS`) is the member's own setting (their vault `AI_COMPAT_BASE_URL`), so
 * core maps it to `InvalidError`: the caller can fix it, and the fixed text names the setting
 * without echoing the URL.
 */
export class BlockedTargetError extends Data.TaggedError("BlockedTargetError")<{
  readonly reason: BlockedTargetReason;
}> {
  readonly code = "blocked_target" as const;

  override get message(): string {
    switch (this.reason) {
      case "scheme": {
        return "Blocked target: only http and https URLs are allowed";
      }
      case "host": {
        return "Blocked target: host is not allowed";
      }
      case "address": {
        return "Blocked target: address is not publicly routable";
      }
      case "resolved": {
        return GENERIC_REQUEST_FAILURE;
      }
      case "proxy": {
        return "Blocked target: egress proxy setting is invalid";
      }
      case "unproxied": {
        return "Blocked target: this lookup cannot use the egress proxy";
      }
      case "redirect": {
        return "Blocked target: redirect target is not allowed";
      }
      case "undeclared": {
        return "Blocked target: this capability does not declare that host";
      }
      case "seed": {
        return "Blocked target: a download request must not carry the investigation input";
      }
      case "ai_origin": {
        return "Blocked target: the AI endpoint is not allowed (a private or loopback endpoint must be listed in WD_AI_PRIVATE_ORIGINS)";
      }
      default: {
        const exhaustive: never = this.reason;
        return exhaustive;
      }
    }
  }
}

/** Which bound of the outbound client a request exceeded. */
export type OutboundLimitKind = "bytes" | "timeout" | "redirects";

/**
 * A response exceeded a bound of the outbound client (byte limit, per-request
 * timeout, or redirect count). The upstream misbehaved, so core maps it to
 * `InternalError`.
 */
export class OutboundLimitError extends Data.TaggedError("OutboundLimitError")<{
  readonly kind: OutboundLimitKind;
  readonly limit: number;
}> {
  readonly code = "outbound_limit" as const;

  override get message(): string {
    switch (this.kind) {
      case "bytes": {
        return `Response exceeded ${this.limit} bytes`;
      }
      case "timeout": {
        return `Request exceeded ${this.limit} ms`;
      }
      case "redirects": {
        return `Redirect limit exceeded (${this.limit})`;
      }
      default: {
        const exhaustive: never = this.kind;
        return exhaustive;
      }
    }
  }
}

export type ToolsTag =
  | RateLimitedError
  | HttpVendorError
  | ParseVendorError
  | MissingCredentialError
  | ValidationVendorError
  | BlockedTargetError
  | OutboundLimitError
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
