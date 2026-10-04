import {
  actorLabelForPersist,
  storedApiKeyActorLabel,
} from "@watchdog/core/actors";
import type { ApiActor } from "@watchdog/schemas";

export function actorLabelFromActor(actor: ApiActor): string | undefined {
  const label = storedApiKeyActorLabel(actor.name);
  if (label === null) return undefined;
  return actorLabelForPersist(label) ?? undefined;
}
