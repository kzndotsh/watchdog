import { storedApiKeyActorLabel } from "@watchdog/core";

import type { ApiActor } from "./context";

export function actorLabelFromActor(actor: ApiActor): string | undefined {
  return storedApiKeyActorLabel(actor.name) ?? undefined;
}
