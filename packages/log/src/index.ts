export type { AuditableLogger } from "evlog";
export { createLogger } from "evlog";
export { identifyUser, maskEmail } from "evlog/better-auth";

export { initWatchdogLogger, type InitWatchdogLoggerOptions } from "./init";
export {
  getRequestLogger,
  peekRequestLogger,
  runWithRequestLogger,
  storage,
} from "./storage";
export type {
  AuthLogFields,
  CapLogFields,
  CaseLogFields,
  JobLogFields,
  UserLogFields,
} from "./fields";
export { jobWideEventFields } from "./fields";
export { evlogEffectLogger, evlogEffectLoggerLayer } from "./effect-logger";
