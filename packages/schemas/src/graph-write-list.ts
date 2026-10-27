import { CONFIDENCE_TIER_LABELS } from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { defineList } from "./lists/define-list";
import { choices, tags } from "./lists/filter-kinds";
import { CONFIDENCE_TIERS } from "./vocab";

/** The longest actor id the `actor` filter takes (a user id or `api-key:` id). */
const GRAPH_WRITE_ACTOR_ID_MAX = 200;

/**
 * The Case's Graph write log (ADR-0007): the audit rows of every write an agent or CLI made to
 * the Graph through `userOverride`, newest first, for `graph.listWrites` and `wd graph writes`.
 * No screen shows it yet; the agent-ingress check and the CLI read it. `q` matches the write's
 * summary and the actor's label, plus the confidence labels.
 */
export const graphWriteList = defineList({
  name: "graph-writes",
  noun: { one: "graph write", many: "graph writes" },
  scope: caseScopeInputSchema,
  filters: {
    confidence: choices("Confidence", CONFIDENCE_TIERS, CONFIDENCE_TIER_LABELS),
    actor: tags("Actor", { maxLength: GRAPH_WRITE_ACTOR_ID_MAX }),
  },
  sorts: {
    created: { label: "Written", type: "time", dirs: ["desc", "asc"] },
  },
  defaultSort: "created.desc",
  search: {
    fields: ["summary", "actorLabel"],
    hint: "summary or actor",
  },
});
