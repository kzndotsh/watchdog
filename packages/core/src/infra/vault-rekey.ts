import { credentialsRepo, lockVaultRekey, type DbExec } from "@watchdog/db";

import { openSecretWithMaster, sealSecretWithMaster } from "./vault-crypto";

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
 * Call it with the process connection and run it once, from the rotation command: the server
 * keeps reading the key from its environment, so restart web and worker after a rotation.
 */
export async function rekeyVault(
  exec: DbExec,
  keys: { readonly oldKey: string; readonly newKey: string }
): Promise<RekeyResult> {
  const oldKey = keys.oldKey.trim();
  const newKey = keys.newKey.trim();
  if (oldKey === newKey) return { status: "same-key" };

  return exec.transaction(async (tx): Promise<RekeyResult> => {
    await lockVaultRekey(tx);
    const rows = await credentialsRepo.listAllCiphertexts(tx);
    if (rows.length === 0) return { status: "empty" };

    const failed = rows.filter(
      (row) => !opens(oldKey, row.userId, row.ciphertext)
    ).length;
    if (failed > 0) {
      const rerun = rows.every((row) =>
        opens(newKey, row.userId, row.ciphertext)
      );
      return rerun
        ? { status: "already-rotated", rows: rows.length }
        : { status: "undecryptable", failed, total: rows.length };
    }

    for (const row of rows) {
      const plaintext = openSecretWithMaster(
        oldKey,
        row.userId,
        row.ciphertext
      );
      // Rows are independent and written inside one transaction: a sequence keeps one
      // plaintext in memory at a time.
      // oxlint-disable-next-line eslint/no-await-in-loop -- one plaintext at a time, one transaction
      const written = await credentialsRepo.setCiphertext(
        tx,
        row.id,
        sealSecretWithMaster(newKey, row.userId, plaintext)
      );
      if (!written) throw new Error("a credential disappeared during rotation");
    }
    return { status: "rotated", rows: rows.length };
  });
}
