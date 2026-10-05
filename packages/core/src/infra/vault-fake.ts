import { Effect, Layer } from "effect";

import { InvalidError, NotFoundError } from "./tagged-errors";
import {
  Vault,
  requireCredentialName,
  type CredentialMeta,
  type VaultApi,
} from "./vault";

/** Secrets by user id, then credential name. */
export type FakeVaultSecrets = Record<string, Record<string, string>>;

const metaOf = (name: string): CredentialMeta => ({
  id: `fake-${name}`,
  name,
  label: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

/**
 * Test Layer: an in-memory `Vault` seeded with `secrets` (`{ [userId]: { NAME:
 * "value" } }`). Same name validation and not-found behaviour as the live
 * vault, no database or master key. `vault.secrets` is the live map, so a test
 * can assert what a `put` stored.
 */
export function fakeVault(initial: FakeVaultSecrets = {}): {
  readonly layer: Layer.Layer<Vault>;
  readonly secrets: Map<string, Map<string, string>>;
} {
  const secrets = new Map<string, Map<string, string>>(
    Object.entries(initial).map(([userId, byName]) => [
      userId,
      new Map(Object.entries(byName)),
    ])
  );
  const slot = (userId: string) => {
    const existing = secrets.get(userId);
    if (existing) return existing;
    const created = new Map<string, string>();
    secrets.set(userId, created);
    return created;
  };
  const api: VaultApi = {
    list: (userId) =>
      Effect.sync(() => [...slot(userId).keys()].map((name) => metaOf(name))),
    has: (userId, name) =>
      Effect.map(requireCredentialName(name), (n) => slot(userId).has(n)),
    get: (userId, name) =>
      Effect.flatMap(requireCredentialName(name), (n) => {
        const secret = slot(userId).get(n);
        return secret === undefined
          ? Effect.fail(new NotFoundError({ entity: "Credential", id: n }))
          : Effect.succeed(secret);
      }),
    put: (input) =>
      Effect.gen(function* fakePutGen() {
        const name = yield* requireCredentialName(input.name);
        const secret = input.secret.trim();
        if (!secret) {
          return yield* new InvalidError({
            reason: "Secret must be non-empty",
          });
        }
        slot(input.userId).set(name, secret);
        return metaOf(name);
      }),
    delete: (userId, name) =>
      Effect.flatMap(requireCredentialName(name), (n) =>
        slot(userId).delete(n)
          ? Effect.void
          : Effect.fail(new NotFoundError({ entity: "Credential", id: n }))
      ),
  };
  return { layer: Layer.succeed(Vault, Vault.of(api)), secrets };
}
