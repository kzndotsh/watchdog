import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import { Data, Effect } from "effect";

import { credentialsRepo, db } from "@watchdog/db";
import { env } from "@watchdog/env/server";
import { trimmedOrNull } from "@watchdog/schemas";

import { tryDb } from "./postgres-effect";
import { InvalidError, NotFoundError, type DomainTag } from "./tagged-errors";

const NONCE_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const HKDF_INFO = Buffer.from("watchdog-vault-v1");
const MASTER_NORMALIZE_SALT = Buffer.from("watchdog-master-vault-normalize");
const MASTER_NORMALIZE_INFO = Buffer.from("watchdog-master-v1");

export class VaultError extends Data.TaggedError("VaultError")<{
  readonly reason: string;
}> {}

export interface CredentialMeta {
  id: string;
  name: string;
  label: string | null;
  updatedAt: string;
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

function toMeta(row: {
  id: string;
  name: string;
  label: string | null;
  updatedAt: Date;
}): CredentialMeta {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const NAME_RE = /^[A-Z][A-Z0-9_]*$/;

function requireCredentialName(name: string): Effect.Effect<string, DomainTag> {
  const trimmed = name.trim();
  if (!NAME_RE.test(trimmed)) {
    return new InvalidError({
      reason: "Credential name must be SCREAMING_SNAKE (A-Z, 0-9, _)",
    });
  }
  return Effect.succeed(trimmed);
}

/** Metadata only — never returns plaintext. */
export function listCredentialMetaEffect(
  userId: string
): Effect.Effect<CredentialMeta[], DomainTag> {
  return tryDb(() => credentialsRepo.listMeta(db, userId)).pipe(
    Effect.map((rows) => rows.map(toMeta))
  );
}

export function hasCredentialEffect(
  userId: string,
  name: string
): Effect.Effect<boolean, DomainTag> {
  return Effect.gen(function* hasCredentialGen() {
    const n = yield* requireCredentialName(name);
    const id = yield* tryDb(() => credentialsRepo.getIdByName(db, userId, n));
    return id !== null;
  });
}

export function getCredentialEffect(
  userId: string,
  name: string
): Effect.Effect<string, DomainTag> {
  return Effect.gen(function* getCredentialGen() {
    const n = yield* requireCredentialName(name);
    const ciphertext = yield* tryDb(() =>
      credentialsRepo.getCiphertext(db, userId, n)
    );
    if (!ciphertext) {
      return yield* new NotFoundError({
        resource: `Credential ${n} is not configured`,
      });
    }
    return yield* Effect.try({
      try: () => open(userKey(userId), Buffer.from(ciphertext)),
      catch: (error) =>
        error instanceof VaultError
          ? new InvalidError({ reason: error.reason })
          : new InvalidError({ reason: "corrupt vault blob" }),
    });
  });
}

interface PutCredentialInput {
  userId: string;
  name: string;
  secret: string;
  label?: string | null;
}

export function putCredentialEffect(
  input: PutCredentialInput
): Effect.Effect<CredentialMeta, DomainTag> {
  return Effect.gen(function* putCredentialGen() {
    const name = yield* requireCredentialName(input.name);
    const secret = input.secret.trim();
    if (!secret) {
      return yield* new InvalidError({ reason: "Secret must be non-empty" });
    }
    const blob = seal(userKey(input.userId), secret);
    const label = trimmedOrNull(input.label);
    const now = new Date();
    const existingId = yield* tryDb(() =>
      credentialsRepo.getIdByName(db, input.userId, name)
    );
    if (existingId !== null) {
      const updated = yield* tryDb(() =>
        credentialsRepo.update(db, existingId, {
          ciphertext: blob,
          label,
          updatedAt: now,
        })
      );
      if (!updated) {
        return yield* Effect.die(new Error("Failed to update credential"));
      }
      return toMeta(updated);
    }
    const created = yield* tryDb(() =>
      credentialsRepo.create(db, {
        userId: input.userId,
        name,
        label,
        ciphertext: blob,
      })
    );
    if (!created) {
      return yield* Effect.die(new Error("Failed to create credential"));
    }
    return toMeta(created);
  });
}

export function deleteCredentialEffect(
  userId: string,
  name: string
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* deleteCredentialGen() {
    const n = yield* requireCredentialName(name);
    const deleted = yield* tryDb(() =>
      credentialsRepo.deleteByName(db, userId, n)
    );
    if (!deleted) {
      return yield* new NotFoundError({ resource: "Credential not found" });
    }
  });
}
