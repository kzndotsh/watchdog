/**
 * Local oxlint JS plugin `watchdog`: house rules oxlint has no built-in for (it ships
 * no `no-restricted-syntax`). Loaded from `oxlint.config.ts` `jsPlugins`. One module
 * per rule under `rules/`, shared helpers under `lib/`; the recipe for adding a rule
 * is in docs/reference/platform/conventions.md.
 */
import { noBrandCast } from "./rules/no-brand-cast.mjs";
import { noCoreDbDynamicImport } from "./rules/no-core-db-dynamic-import.mjs";
import { noCoreS3DynamicImport } from "./rules/no-core-s3-dynamic-import.mjs";
import { noUntrustedIdImport } from "./rules/no-untrusted-id-import.mjs";
import { procedureMustBeGuarded } from "./rules/procedure-must-be-guarded.mjs";

export default {
  meta: { name: "watchdog" },
  rules: {
    "no-core-db-dynamic-import": noCoreDbDynamicImport,
    "no-core-s3-dynamic-import": noCoreS3DynamicImport,
    "no-brand-cast": noBrandCast,
    "no-untrusted-id-import": noUntrustedIdImport,
    "procedure-must-be-guarded": procedureMustBeGuarded,
  },
};
