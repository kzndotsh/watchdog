import { Effect } from "effect";

import { lockVaultRekey } from "#db";

import { InternalError, type DomainTag } from "../errors/tagged-errors";
import type { Db } from "../infra/db-service";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import { credentialsRepoFx } from "../infra/repos-fx";
import {
  openSecretWithMaster,
  sealSecretWithMaster,
} from "../infra/vault-crypto";

export type RekeyResult =
  /** Every credential now opens under the new key (and no longer under the old one). */
  | { readonly status: "rotated"; readonly rows: number }
  /** The vault is empty: nothing to re-encrypt, the new key simply applies. */
  | { readonly status: "empty" }
  /** The old and new keys are the same value. Nothing changed. */
  | { readonly status: "same-key" }
  /** Every row already opens under the new key and none under the old: a rerun. Nothing changed. */
  | { readonly status: "already-rotated"; readonly rows: number }
  /** Some rows do not open under the old key. Nothing changed. */
  | {
      readonly status: "undecryptable";
      readonly failed: number;
      readonly total: number;
    };

function opens(master: string, userId: string, blob: Buffer): boolean {
  try {
    openSecretWithMaster(master, userId, blob);
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-encrypt every stored vault credential from `oldKey` to `newKey`, all or nothing.
 *
 * One transaction behind an advisory lock (two runs cannot interleave). It first proves every
 * row opens under the old key and only then writes, so a wrong old key, or a row corrupted
 * earlier, aborts with a count and changes nothing. Plaintext lives only inside this call and
 * is never returned or logged. The keys are taken as given (trimmed like the vault does):
 * the old one may be a placeholder or short, which is why it is not validated as a secret.
 *
 * Run it once, from the rotation command, over the process connection (`Db.layerOf(db)`): the
 * server keeps reading the key from its environment, so restart web and worker after a rotation.
 */
export function rekeyVaultEffect(keys: {
  readonly oldKey: string;
  readonly newKey: string;
}): Effect.Effect<RekeyResult, DomainTag, Db> {
  const oldKey = keys.oldKey.trim();
  const newKey = keys.newKey.trim();
  if (oldKey === newKey) return Effect.succeed({ status: "same-key" });

  return transact((tx) =>
    Effect.gen(function* rekeyVaultGen() {
      yield* tryDb(() => lockVaultRekey(tx));
      const rows = yield* credentialsRepoFx.listAllCiphertexts(tx);
      if (rows.length === 0) return { status: "empty" } as const;

      const failed = rows.filter(
        (row) => !opens(oldKey, row.userId, row.ciphertext)
      ).length;
      if (failed > 0) {
        const rerun = rows.every((row) =>
          opens(newKey, row.userId, row.ciphertext)
        );
        return rerun
          ? ({ status: "already-rotated", rows: rows.length } as const)
          : ({ status: "undecryptable", failed, total: rows.length } as const);
      }

      // Rows are independent and written inside one transaction: a sequence keeps one
      // plaintext in memory at a time.
      for (const row of rows) {
        const plaintext = openSecretWithMaster(
          oldKey,
          row.userId,
          row.ciphertext
        );
        const written = yield* credentialsRepoFx.setCiphertext(
          tx,
          row.id,
          sealSecretWithMaster(newKey, row.userId, plaintext)
        );
        if (!written) {
          return yield* new InternalError({
            reason: "a credential disappeared during rotation",
          });
        }
      }
      return { status: "rotated", rows: rows.length } as const;
    })
  );
}
