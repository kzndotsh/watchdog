import { bansDynamicImport } from "../lib/dynamic-import.mjs";

export const noCoreDbDynamicImport = bansDynamicImport(
  "#db",
  "Ban `import('#db')`, which bypasses the static global-db import ban.",
  "Core reads the database through the Db service (tryDbWith / transact, see packages/server/AGENTS.md); a dynamic import of #db bypasses the global-db ban."
);
