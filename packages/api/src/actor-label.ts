import {
  actorLabelForPersist,
  storedApiKeyActorLabel,
} from "@watchdog/core/actors";
import type { GraphActor } from "@watchdog/core/graph";
import type { ApiActor } from "@watchdog/schemas/shared";

export function actorLabelFromActor(actor: ApiActor): string | undefined {
  const label = storedApiKeyActorLabel(actor.name);
  if (label === null) return undefined;
  return actorLabelForPersist(label) ?? undefined;
}

/** The caller as the actor of a Dossier edit, so its activity entry carries who made it. */
export function graphActorFromContext(actor: ApiActor): GraphActor {
  return { actorId: actor.userId, actorLabel: actorLabelFromActor(actor) };
}
