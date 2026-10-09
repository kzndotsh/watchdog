import { bansDynamicImport } from "../lib/dynamic-import.mjs";

export const noCoreDbDynamicImport = bansDynamicImport(
  "@watchdog/db",
  "Ban `import('@watchdog/db')`, which bypasses the static global-db import ban.",
  "Core reads the database through the Db service (tryDbWith / transact, see packages/core/AGENTS.md); a dynamic import of @watchdog/db bypasses the global-db ban."
);
