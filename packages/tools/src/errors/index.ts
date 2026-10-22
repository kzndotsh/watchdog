export { httpVendorError, abortedError } from "./vendor-errors";
export {
  AbortedError,
  BlockedTargetError,
  GENERIC_REQUEST_FAILURE,
  OutboundLimitError,
  type BlockedTargetReason,
  type OutboundLimitKind,
  RateLimitedError,
  HttpVendorError,
  ParseVendorError,
  MissingCredentialError,
  ValidationVendorError,
  UnexpectedToolError,
  type ToolsTag,
} from "./tagged-errors";
export { upstreamDiagnostic } from "./diagnostic";
export { isToolsTag, mapToolsCatch } from "./map-tools-catch";
export { watchdogUserAgent } from "./user-agent";
