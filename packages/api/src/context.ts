import type { AuditableLogger } from "@watchdog/log";
import type { ApiCaller } from "@watchdog/schemas/shared";

export interface ApiContext extends ApiCaller {
  /** Present when Start ALS has bound a request/ServerFn logger. */
  log?: AuditableLogger;
}
