import { Logger } from "effect";
import { createLogger } from "evlog";

/** Cap Job wide fields still come from `jobWideEventFields` in the worker handler. */
export const evlogEffectLogger = Logger.make((options) => {
  const log = createLogger({ scope: "effect" });
  const message = Array.isArray(options.message)
    ? options.message.map(String).join(" ")
    : String(options.message);
  log.set({
    message,
    level: options.logLevel,
  });
  void log.emit();
});

export const evlogEffectLoggerLayer = Logger.layer([evlogEffectLogger]);
