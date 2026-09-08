import { Effect } from "effect";

import { db, usersRepo, type UserDisplayRow } from "@watchdog/db";
import { normalizeUuidList } from "@watchdog/schemas";

import { tryDb } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";
import { formatActorLabel, type ActorUser } from "./format-actor-label";

export function loadActorUsersEffect(
  actorIds: Iterable<string | null | undefined>
): Effect.Effect<Map<string, ActorUser>, DomainTag> {
  const ids = normalizeUuidList(actorIds);
  if (ids.length === 0) {
    return Effect.succeed(new Map<string, ActorUser>());
  }
  return tryDb(() => usersRepo.getByIds(db, ids)).pipe(
    Effect.map((rows: UserDisplayRow[]) => {
      const map = new Map<string, ActorUser>();
      for (const row of rows) {
        map.set(row.id, { name: row.name, email: row.email });
      }
      return map;
    })
  );
}

export function labelForActor(
  actorId: string,
  users: ReadonlyMap<string, ActorUser>,
  storedLabel?: string | null
): string {
  return formatActorLabel(actorId, users.get(actorId), storedLabel);
}
