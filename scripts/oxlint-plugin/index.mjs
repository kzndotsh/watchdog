import { noBannedSurfaceName } from "./rules/no-banned-surface-name.mjs";
/**
 * Local oxlint JS plugin `watchdog`: house rules oxlint has no built-in for (it ships
 * no `no-restricted-syntax`). Loaded from `oxlint.config.ts` `jsPlugins`. One module
 * per rule under `rules/`, shared helpers under `lib/`; the recipe for adding a rule
 * is in docs/reference/platform/conventions.md.
 */
import { noBrandCast } from "./rules/no-brand-cast.mjs";
import { noCoreDbDynamicImport } from "./rules/no-core-db-dynamic-import.mjs";
import { noCoreS3DynamicImport } from "./rules/no-core-s3-dynamic-import.mjs";
import { noDecorativeClass } from "./rules/no-decorative-class.mjs";
import { noOpaqueIdSlice } from "./rules/no-opaque-id-slice.mjs";
import { noUntrustedIdImport } from "./rules/no-untrusted-id-import.mjs";

export default {
  meta: { name: "watchdog" },
  rules: {
    "no-core-db-dynamic-import": noCoreDbDynamicImport,
    "no-core-s3-dynamic-import": noCoreS3DynamicImport,
    "no-brand-cast": noBrandCast,
    "no-untrusted-id-import": noUntrustedIdImport,
    "no-decorative-class": noDecorativeClass,
    "no-banned-surface-name": noBannedSurfaceName,
    "no-opaque-id-slice": noOpaqueIdSlice,
  },
};
