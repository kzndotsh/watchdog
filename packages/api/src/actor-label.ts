import { actorLabelForPersist } from "@watchdog/core/actors";
import type { GraphActor } from "@watchdog/core/graph";
import type { ApiActor, ApiCredential } from "@watchdog/schemas/shared";

/** An authenticated caller: the actor and the credential it proved itself with. */
type AuthedCaller = { actor: ApiActor; credential: ApiCredential };

/**
 * The display snapshot stored with a key-made change (`api-key:<name>`, the actor's name as
 * `createApiContext` set it); undefined for a session. Whether the caller is a key is decided by
 * the credential, never by the label.
 */
export function actorLabelFromContext(
  caller: AuthedCaller
): string | undefined {
  if (caller.credential.kind !== "apiKey") return undefined;
  return actorLabelForPersist(caller.actor.name) ?? undefined;
}

/** The API key the caller proved itself with (its Better Auth id); undefined for a session. */
export function actorKeyIdFromContext(
  caller: AuthedCaller
): string | undefined {
  return caller.credential.kind === "apiKey"
    ? caller.credential.keyId
    : undefined;
}

/** The caller as the actor of a Dossier edit, so its history and activity entry carry who (and which key) made it. */
export function graphActorFromContext(caller: AuthedCaller): GraphActor {
  return {
    actorId: caller.actor.userId,
    actorLabel: actorLabelFromContext(caller),
    actorKeyId: actorKeyIdFromContext(caller),
  };
}
