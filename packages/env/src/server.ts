import { createEnv } from "@t3-oss/env-core";

import {
  authFields,
  createEnvOptions,
  databaseFields,
  exportFields,
  nodeEnvFields,
  s3Fields,
  smtpFields,
  vaultFields,
} from "./fragments";
import { loadRepoEnv } from "./load";

loadRepoEnv();

/**
 * Platform boot secrets for web / worker / db / core.
 * Cap API keys stay in the vault (`WD_MASTER_VAULT_KEY` + Settings).
 *
 * Call sites must use `env.FOO`. The `wd` CLI parses `WD_API_*` in-process
 * (see `@watchdog/cli`), not this package.
 * Set `SKIP_ENV_VALIDATION=1` only for lint/Docker without secrets.
 */
export const env = createEnv({
  server: {
    ...databaseFields,
    ...authFields,
    ...smtpFields,
    ...s3Fields,
    ...vaultFields,
    ...exportFields,
    ...nodeEnvFields,
  },
  ...createEnvOptions,
});
