import type { AuditableLogger } from "@watchdog/log";
import type { ApiCaller } from "@watchdog/schemas/shared";

export type ApiContext = {
  /** Present when Start ALS has bound a request/ServerFn logger. */
  log?: AuditableLogger;
  /**
   * Headers added to the HTTP response (oRPC's `ResponseHeadersPlugin` provides them); absent
   * for an in-process client, which has no response to add to.
   */
  resHeaders?: Headers;
} & ApiCaller;
