import { sql } from "drizzle-orm";

import type { PatchOp } from "@watchdog/schemas/graph";
import type {
  CaseId,
  ConfidenceTier,
  GraphActor,
  GraphHistoryChannel,
} from "@watchdog/schemas/shared";

import type { DbExec } from "./exec";
import { changesets } from "./schema/changesets";

/** The provenance row of a Graph write transaction (#724): its Case and what the channel adds. */
export type NewChangeset = {
  caseId: CaseId;
  /** The Proposal a Triage Accept applies. */
  proposalId?: string | null;
  /** An agent write's key: a second write with the same Case, actor and key is refused (`changesets_case_actor_idem_uidx`). */
  idempotencyKey?: string | null;
  summary?: string | null;
  /** An agent write: the tier its rows land at and the ops it sent. */
  confidence?: ConfidenceTier | null;
  patch?: readonly PatchOp[] | null;
};

/** Who is writing the Graph in this transaction, and through which door. */
export type GraphHistoryContext = GraphActor & {
  channel: GraphHistoryChannel;
  /** The transaction's changeset. Without one, the history trigger creates one per Case it writes. */
  changeset?: NewChangeset;
};

/**
 * Tell the Graph triggers who is writing: transaction-local settings
 * (`watchdog.actor_id`, `watchdog.actor_label`, `watchdog.actor_key_id`, `watchdog.channel`,
 * `watchdog.changeset_id`) that the `graph_history_row` and `graph_attribution` triggers read.
 * With `changeset`, the same statement inserts the transaction's `changesets` row and returns its
 * id; every history row the transaction writes in that Case names it. Call it once, as the first
 * statement of a Graph write transaction, on that transaction's `tx`: the settings end with it.
 * The application role may not write the Graph without them (the database refuses with
 * `HISTORY_CONTEXT_MISSING_SQLSTATE` (`@watchdog/schemas/shared`)); the owner role may, and is
 * recorded as channel `system`, no actor. Not a repo (it opens no transaction), so it may use a
 * raw statement.
 */
export async function setGraphHistoryContext(
  exec: DbExec,
  context: GraphHistoryContext
): Promise<string | null> {
  const cs = context.changeset;
  const inserted =
    cs === undefined
      ? sql``
      : sql`with cs as (
    insert into ${changesets} ("case_id", "channel", "actor_id", "actor_label", "actor_key_id",
      "proposal_id", "idempotency_key", "summary", "confidence", "patch")
    values (${cs.caseId}, ${context.channel}, ${context.actorId ?? null},
      ${context.actorLabel ?? null}, ${context.actorKeyId ?? null}, ${cs.proposalId ?? null},
      ${cs.idempotencyKey ?? null}, ${cs.summary ?? null}, ${cs.confidence ?? null},
      ${cs.patch === undefined || cs.patch === null ? null : JSON.stringify(cs.patch)}::jsonb)
    returning "id"
  ) `;
  const changesetId =
    cs === undefined ? sql`''` : sql`(select "id"::text from cs)`;
  const [row] = await exec.execute<{
    changeset_id: string;
  }>(sql`${inserted}select
    set_config('watchdog.actor_id', ${context.actorId ?? ""}, true),
    set_config('watchdog.actor_label', ${context.actorLabel ?? ""}, true),
    set_config('watchdog.actor_key_id', ${context.actorKeyId ?? ""}, true),
    set_config('watchdog.channel', ${context.channel}, true),
    set_config('watchdog.changeset_id', ${changesetId}, true) as changeset_id`);
  const id = row?.changeset_id ?? "";
  return id === "" ? null : id;
}
