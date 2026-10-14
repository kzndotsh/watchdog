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
export {
  serverTimingHeader,
  shouldEmitServerTiming,
  startRequestTiming,
  timedDbCall,
  withServerTiming,
  type RequestTiming,
} from "./request-timing";
export type {
  AuthLogFields,
  CapLogFields,
  CaseLogFields,
  DbLogFields,
  JobLogFields,
  RequestTimingLogFields,
  UserLogFields,
} from "./fields";
export { jobWideEventFields } from "./fields";
export { evlogEffectLogger, evlogEffectLoggerLayer } from "./effect-logger";
