import { Data } from "effect";

export class RateLimitedError extends Data.TaggedError("RateLimitedError")<{
  readonly service: string;
  readonly subject: string;
  readonly retryAfterMs?: number;
}> {}

export class HttpVendorError extends Data.TaggedError("HttpVendorError")<{
  readonly service: string;
  readonly status: number;
}> {}

export class ParseVendorError extends Data.TaggedError("ParseVendorError")<{
  readonly service: string;
  readonly subject: string;
}> {}

export class MissingCredentialError extends Data.TaggedError(
  "MissingCredentialError"
)<{
  readonly slot: string;
}> {}

export class ValidationVendorError extends Data.TaggedError(
  "ValidationVendorError"
)<{
  readonly message: string;
}> {}

export type ToolsTag =
  | RateLimitedError
  | HttpVendorError
  | ParseVendorError
  | MissingCredentialError
  | ValidationVendorError;
