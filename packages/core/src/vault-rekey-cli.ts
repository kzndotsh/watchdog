/**
 * Vault master-key rotation command: re-encrypts every stored credential from the old key to
 * the configured WD_MASTER_VAULT_KEY, all or nothing. Locally `just vault-rekey` runs this file
 * through tsx; the web image carries it bundled as `vault-rekey.mjs`
 * (packages/core/scripts/build-rekey.mjs). Prints counts only, never a key or a secret.
 * Exit codes: 0 rotated (or nothing to rotate), 1 refused or failed, 2 bad usage.
 */
import { readFileSync } from "node:fs";

// The process entry owns its connection through `withPool` (acquire, then end with the bounded
// timeout), like the worker and web do through `Db.owned`: this file is not a service.
// oxlint-disable-next-line eslint/no-restricted-imports -- process entry, see above
import { withPool } from "@watchdog/db";
import { env } from "@watchdog/env/server";

import { rekeyVault } from "./infra/vault-rekey";
import {
  OLD_KEY_ENV,
  parseRekeyArgs,
  resolveOldKey,
  VAULT_REKEY_USAGE,
} from "./infra/vault-rekey-args";

const out = (text: string) => process.stdout.write(`${text}\n`);
const err = (text: string) => process.stderr.write(`${text}\n`);

function usageError(message: string): never {
  err(`vault-rekey: ${message}\n\n${VAULT_REKEY_USAGE}`);
  process.exit(2);
}

async function main(): Promise<void> {
  const parsed = parseRekeyArgs(process.argv.slice(2));
  if (!parsed.ok) usageError(parsed.message);
  if (parsed.args.help) {
    out(VAULT_REKEY_USAGE);
    return;
  }
  const old = resolveOldKey({
    oldKeyStdin: parsed.args.oldKeyStdin,
    env: process.env,
    // Fd 0 is stdin whether it is a pipe or a file; only `--old-key-stdin` reads it.
    readStdin: () => readFileSync(0, "utf-8"),
  });
  if (!old.ok) usageError(old.message);

  await withPool(async ({ db }) => {
    const result = await rekeyVault(db, {
      oldKey: old.key,
      newKey: env.WD_MASTER_VAULT_KEY,
    });
    switch (result.status) {
      case "rotated": {
        out(
          `vault-rekey: re-encrypted ${result.rows} credential(s) under the new key. Restart web and worker so they use it.`
        );
        return;
      }
      case "empty": {
        out(
          "vault-rekey: the vault holds no credentials, so there is nothing to re-encrypt. The new key applies as is."
        );
        return;
      }
      case "same-key": {
        err(
          "vault-rekey: the old and the new key are the same. Nothing changed."
        );
        process.exitCode = 1;
        return;
      }
      case "already-rotated": {
        err(
          `vault-rekey: all ${result.rows} credential(s) already open under the new key and none under the old one: this looks like a rerun. Nothing changed.`
        );
        process.exitCode = 1;
        return;
      }
      case "undecryptable": {
        err(
          `vault-rekey: ${result.failed} of ${result.total} credential(s) do not open under the old key, so nothing was changed. Check ${OLD_KEY_ENV}: it must be the key the credentials are encrypted under now.`
        );
        process.exitCode = 1;
        return;
      }
      default: {
        return result satisfies never;
      }
    }
  });
}

try {
  await main();
} catch (error) {
  err(
    `vault-rekey: failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
}
