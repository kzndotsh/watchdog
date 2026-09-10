import { actorLabelForPersist, storedApiKeyActorLabel } from "@watchdog/core";

import type { ApiActor } from "./context";

export function actorLabelFromActor(actor: ApiActor): string | undefined {
  const label = storedApiKeyActorLabel(actor.name);
  if (label === null) return undefined;
  return actorLabelForPersist(label) ?? undefined;
}
