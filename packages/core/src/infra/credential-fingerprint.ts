import { createHmac, hkdfSync } from "node:crypto";

import { env } from "@watchdog/env/server";
import type {
  CredentialFingerprint,
  CredentialRole,
} from "@watchdog/tools/breach";

import { masterKeyBytes } from "./vault-crypto";

/**
 * The HKDF `info` label of the reuse-fingerprint key. Fixed and versioned: changing it changes
 * every fingerprint, so a new label is a new version (`/v2`), never an edit.
 */
export const CREDENTIAL_REUSE_LABEL = "watchdog/breach-credential-reuse/v1";

const KEY_LEN = 32;

/**
 * The reuse-fingerprint key: HKDF-SHA256 over the master secret (`WD_MASTER_VAULT_KEY`, the
 * same normalisation the vault uses) with an empty salt and `CREDENTIAL_REUSE_LABEL` as info.
 * No new secret. It is a different key from every vault key (different info), and it never
 * leaves core: Caps receive only the function `makeCredentialFingerprint` returns.
 */
function reuseKey(master: string): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      masterKeyBytes(master),
      Buffer.alloc(0),
      Buffer.from(CREDENTIAL_REUSE_LABEL, "utf-8"),
      KEY_LEN
    )
  );
}

/**
 * A fingerprint function under the key of `master`: HMAC-SHA256 of the exact value, lower-case
 * hex. The role is part of the message (`<role>\0<value>`), so a plaintext and a hash that
 * happen to be the same string never match. The same password hashed by two providers is two
 * different values and does not match either.
 */
export function makeCredentialFingerprint(
  master: string
): CredentialFingerprint {
  const key = reuseKey(master);
  return (value: string, role: CredentialRole) =>
    createHmac("sha256", key)
      .update(`${role}\0${value}`, "utf-8")
      .digest("hex");
}

/** The instance's fingerprint function: the key comes from `WD_MASTER_VAULT_KEY`. */
export function instanceCredentialFingerprint(): CredentialFingerprint {
  return makeCredentialFingerprint(env.WD_MASTER_VAULT_KEY);
}
