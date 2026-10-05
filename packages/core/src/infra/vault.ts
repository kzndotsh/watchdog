import { Context, Effect, Layer } from "effect";

import { credentialsRepo, type DbExec } from "@watchdog/db";
import { trimmedOrNull, credentialNameSchema } from "@watchdog/schemas/shared";

import { Db } from "./db-service";
import { tryDbWith } from "./postgres-effect";
import {
  InternalError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "./tagged-errors";
import { VaultError, openSecret, sealSecret } from "./vault-crypto";

export { VaultError };

export interface CredentialMeta {
  id: string;
  name: string;
  label: string | null;
  updatedAt: string;
}

export interface PutCredentialInput {
  userId: string;
  name: string;
  secret: string;
  label?: string | null;
}

/** Credential access: the vault reader/writer a process composes once. */
export interface VaultApi {
  /** Metadata only: never returns plaintext. */
  readonly list: (userId: string) => Effect.Effect<CredentialMeta[], DomainTag>;
  readonly has: (
    userId: string,
    name: string
  ) => Effect.Effect<boolean, DomainTag>;
  /** Decrypted secret; `NotFoundError` when the slot is empty. */
  readonly get: (
    userId: string,
    name: string
  ) => Effect.Effect<string, DomainTag>;
  readonly put: (
    input: PutCredentialInput
  ) => Effect.Effect<CredentialMeta, DomainTag>;
  readonly delete: (
    userId: string,
    name: string
  ) => Effect.Effect<void, DomainTag>;
}

/**
 * The credential vault as an Effect service (ADR-0002 phase 3): every
 * `*CredentialEffect` below is `R = Vault`, so Cap `getCredential`, availability
 * checks and the credentials API read secrets through it and tests provide
 * fake credentials (`fakeVault`) instead of patching modules. `vaultLayer` is
 * the live reader over `Db` and the vault crypto.
 */
export class Vault extends Context.Service<Vault, VaultApi>()(
  "@watchdog/core/infra/Vault"
) {}

export function toMeta(row: {
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

export function requireCredentialName(
  name: string
): Effect.Effect<string, DomainTag> {
  const parsed = credentialNameSchema.safeParse(name);
  if (!parsed.success) {
    return new InvalidError({
      reason: "Credential name must be SCREAMING_SNAKE (A-Z, 0-9, _)",
    });
  }
  return Effect.succeed(parsed.data);
}

function listLive(userId: string) {
  return tryDbWith((exec) => credentialsRepo.listMeta(exec, userId)).pipe(
    Effect.map((rows) => rows.map(toMeta))
  );
}

function hasLive(userId: string, name: string) {
  return Effect.gen(function* hasCredentialGen() {
    const n = yield* requireCredentialName(name);
    const id = yield* tryDbWith((exec) =>
      credentialsRepo.getIdByName(exec, userId, n)
    );
    return id !== null;
  });
}

function getLive(userId: string, name: string) {
  return Effect.gen(function* getCredentialGen() {
    const n = yield* requireCredentialName(name);
    const ciphertext = yield* tryDbWith((exec) =>
      credentialsRepo.getCiphertext(exec, userId, n)
    );
    if (!ciphertext) {
      return yield* new NotFoundError({ entity: "Credential", id: n });
    }
    return yield* Effect.try({
      try: () => openSecret(userId, Buffer.from(ciphertext)),
      catch: (error) =>
        error instanceof VaultError
          ? new InvalidError({ reason: error.reason })
          : new InvalidError({ reason: "corrupt vault blob" }),
    });
  });
}

function putLive(input: PutCredentialInput) {
  return Effect.gen(function* putCredentialGen() {
    const name = yield* requireCredentialName(input.name);
    const secret = input.secret.trim();
    if (!secret) {
      return yield* new InvalidError({ reason: "Secret must be non-empty" });
    }
    const blob = sealSecret(input.userId, secret);
    const label = trimmedOrNull(input.label);
    const existingId = yield* tryDbWith((exec) =>
      credentialsRepo.getIdByName(exec, input.userId, name)
    );
    if (existingId !== null) {
      const updated = yield* tryDbWith((exec) =>
        credentialsRepo.update(exec, existingId, {
          ciphertext: blob,
          label,
        })
      );
      if (!updated) {
        return yield* new InternalError({
          reason: "Failed to update credential",
        });
      }
      return toMeta(updated);
    }
    const created = yield* tryDbWith((exec) =>
      credentialsRepo.create(exec, {
        userId: input.userId,
        name,
        label,
        ciphertext: blob,
      })
    );
    if (!created) {
      return yield* new InternalError({
        reason: "Failed to create credential",
      });
    }
    return toMeta(created);
  });
}

function deleteLive(userId: string, name: string) {
  return Effect.gen(function* deleteCredentialGen() {
    const n = yield* requireCredentialName(name);
    const deleted = yield* tryDbWith((exec) =>
      credentialsRepo.deleteByName(exec, userId, n)
    );
    if (!deleted) {
      return yield* new NotFoundError({ entity: "Credential", id: n });
    }
  });
}

/** The live vault over one `DbExec` (the process's `Db` service value). */
function liveVault(exec: DbExec): VaultApi {
  const onDb = <A>(effect: Effect.Effect<A, DomainTag, Db>) =>
    Effect.provideService(effect, Db, exec);
  return {
    list: (userId) => onDb(listLive(userId)),
    has: (userId, name) => onDb(hasLive(userId, name)),
    get: (userId, name) => onDb(getLive(userId, name)),
    put: (input) => onDb(putLive(input)),
    delete: (userId, name) => onDb(deleteLive(userId, name)),
  };
}

/**
 * Live Layer: reads and writes the `credentials` table through the `Db`
 * service captured at build time, sealing with the master vault key.
 */
export const vaultLayer: Layer.Layer<Vault, never, Db> = Layer.effect(
  Vault,
  Effect.gen(function* vaultLayerGen() {
    const exec = yield* Db;
    return Vault.of(liveVault(exec));
  })
);

function viaVault<A>(
  operation: (vault: VaultApi) => Effect.Effect<A, DomainTag>
): Effect.Effect<A, DomainTag, Vault> {
  return Effect.gen(function* viaVaultGen() {
    const vault = yield* Vault;
    return yield* operation(vault);
  });
}

/** Metadata only: never returns plaintext. */
export function listCredentialMetaEffect(
  userId: string
): Effect.Effect<CredentialMeta[], DomainTag, Vault> {
  return viaVault((vault) => vault.list(userId));
}

export function hasCredentialEffect(
  userId: string,
  name: string
): Effect.Effect<boolean, DomainTag, Vault> {
  return viaVault((vault) => vault.has(userId, name));
}

export function getCredentialEffect(
  userId: string,
  name: string
): Effect.Effect<string, DomainTag, Vault> {
  return viaVault((vault) => vault.get(userId, name));
}

export function putCredentialEffect(
  input: PutCredentialInput
): Effect.Effect<CredentialMeta, DomainTag, Vault> {
  return viaVault((vault) => vault.put(input));
}

export function deleteCredentialEffect(
  userId: string,
  name: string
): Effect.Effect<void, DomainTag, Vault> {
  return viaVault((vault) => vault.delete(userId, name));
}
