import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import { Data } from "effect";

import { env } from "@watchdog/env/server";

const NONCE_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const HKDF_INFO = Buffer.from("watchdog-vault-v1");
const MASTER_NORMALIZE_SALT = Buffer.from("watchdog-master-vault-normalize");
const MASTER_NORMALIZE_INFO = Buffer.from("watchdog-master-v1");

export class VaultError extends Data.TaggedError("VaultError")<{
  readonly reason: string;
}> {
  readonly code = "vault" as const;
}

function masterKeyBytes(): Buffer {
  const raw = env.WD_MASTER_VAULT_KEY.trim();
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === KEY_LEN) return b64;
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === KEY_LEN * 2) {
    return Buffer.from(raw, "hex");
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(raw, "utf-8"),
      MASTER_NORMALIZE_SALT,
      MASTER_NORMALIZE_INFO,
      KEY_LEN
    )
  );
}

function userKey(userId: string): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      masterKeyBytes(),
      Buffer.from(userId, "utf-8"),
      HKDF_INFO,
      KEY_LEN
    )
  );
}

function seal(key: Buffer, plaintext: string): Buffer {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const enc = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf-8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, enc]);
}

function open(key: Buffer, blob: Buffer): string {
  if (blob.length < NONCE_LEN + TAG_LEN + 1) {
    throw new VaultError({ reason: "corrupt vault blob" });
  }
  const nonce = blob.subarray(0, NONCE_LEN);
  const tag = blob.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN);
  const ct = blob.subarray(NONCE_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString("utf-8");
}

/** AES-256-GCM seal under the user's HKDF-derived key. */
export function sealSecret(userId: string, plaintext: string): Buffer {
  return seal(userKey(userId), plaintext);
}

/** Inverse of `sealSecret`; throws `VaultError` on a corrupt blob. */
export function openSecret(userId: string, blob: Buffer): string {
  return open(userKey(userId), blob);
}
