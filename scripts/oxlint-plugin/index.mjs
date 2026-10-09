/**
 * Local oxlint JS plugin `watchdog`: house rules oxlint has no built-in for (it ships
 * no `no-restricted-syntax`). Loaded from `oxlint.config.ts` `jsPlugins`. One module
 * per rule under `rules/`, shared helpers under `lib/`; the recipe for adding a rule
 * is in docs/reference/platform/conventions.md.
 */
import { dbRepoExecFirst } from "./rules/db-repo-exec-first.mjs";
import { dbRepoNoDtoDate } from "./rules/db-repo-no-dto-date.mjs";
import { dbRepoNoJobStatusSet } from "./rules/db-repo-no-job-status-set.mjs";
import { dbRepoNoNotify } from "./rules/db-repo-no-notify.mjs";
import { dbRepoNoRawSql } from "./rules/db-repo-no-raw-sql.mjs";
import { dbRepoNoSqlParam } from "./rules/db-repo-no-sql-param.mjs";
import { dbRepoNoThrow } from "./rules/db-repo-no-throw.mjs";
import { dbRepoNoTransaction } from "./rules/db-repo-no-transaction.mjs";
import { dbRepoNoTrimOrNull } from "./rules/db-repo-no-trim-or-null.mjs";
import { dbRepoNoValidationImport } from "./rules/db-repo-no-validation-import.mjs";
import { dbRepoTrimLookupOnly } from "./rules/db-repo-trim-lookup-only.mjs";
import { effectTryRequiresCatch } from "./rules/effect-try-requires-catch.mjs";
import { noBannedSurfaceName } from "./rules/no-banned-surface-name.mjs";
import { noBrandCast } from "./rules/no-brand-cast.mjs";
import { noCoreDbDynamicImport } from "./rules/no-core-db-dynamic-import.mjs";
import { noCoreS3DynamicImport } from "./rules/no-core-s3-dynamic-import.mjs";
import { noCrossDomainRelativeImports } from "./rules/no-cross-domain-relative-imports.mjs";
import { noDecorativeClass } from "./rules/no-decorative-class.mjs";
import { noEffectRunOutsideEdge } from "./rules/no-effect-run-outside-edge.mjs";
import { noHooksInLib } from "./rules/no-hooks-in-lib.mjs";
import { noOpaqueIdSlice } from "./rules/no-opaque-id-slice.mjs";
import { noTypesFromFunctions } from "./rules/no-types-from-functions.mjs";
import { noUntrustedIdImport } from "./rules/no-untrusted-id-import.mjs";
import { procedureMustBeGuarded } from "./rules/procedure-must-be-guarded.mjs";
import { sharedUiNoDomainImports } from "./rules/shared-ui-no-domain-imports.mjs";

export default {
  meta: { name: "watchdog" },
  rules: {
    "db-repo-exec-first": dbRepoExecFirst,
    "db-repo-no-dto-date": dbRepoNoDtoDate,
    "db-repo-no-job-status-set": dbRepoNoJobStatusSet,
    "db-repo-no-notify": dbRepoNoNotify,
    "db-repo-no-raw-sql": dbRepoNoRawSql,
    "db-repo-no-sql-param": dbRepoNoSqlParam,
    "db-repo-no-throw": dbRepoNoThrow,
    "db-repo-no-transaction": dbRepoNoTransaction,
    "db-repo-no-trim-or-null": dbRepoNoTrimOrNull,
    "db-repo-no-validation-import": dbRepoNoValidationImport,
    "db-repo-trim-lookup-only": dbRepoTrimLookupOnly,
    "no-core-db-dynamic-import": noCoreDbDynamicImport,
    "no-core-s3-dynamic-import": noCoreS3DynamicImport,
    "no-brand-cast": noBrandCast,
    "no-untrusted-id-import": noUntrustedIdImport,
    "procedure-must-be-guarded": procedureMustBeGuarded,
    "effect-try-requires-catch": effectTryRequiresCatch,
    "no-effect-run-outside-edge": noEffectRunOutsideEdge,
    "no-decorative-class": noDecorativeClass,
    "no-banned-surface-name": noBannedSurfaceName,
    "no-opaque-id-slice": noOpaqueIdSlice,
    "shared-ui-no-domain-imports": sharedUiNoDomainImports,
    "no-hooks-in-lib": noHooksInLib,
    "no-types-from-functions": noTypesFromFunctions,
    "no-cross-domain-relative-imports": noCrossDomainRelativeImports,
  },
};
