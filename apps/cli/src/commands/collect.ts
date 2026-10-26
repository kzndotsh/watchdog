import { evidenceDisplayLabel } from "@watchdog/schemas/evidence";
import { collectList } from "@watchdog/schemas/jobs";

import { api, emitList, truncText } from "../client";
import { requireCaseId } from "../ids";
import { listFlags, listInputFromFlags } from "../list-flags";
import { caseListHelp } from "../list-help";
import { asBoolean, caseArg, defineNounCommand } from "../noun";
import { fetchListPage } from "../paging";

const LIST_COLUMNS = [
  "id",
  "kind",
  "state",
  "label",
  "jobs",
  "activity",
  "started",
];

type Row = Awaited<
  ReturnType<ReturnType<typeof api>["collect"]["list"]>
>["items"][number];

/** What names the row: the Evidence, the playbook of a run, or the Cap of a lone Job. */
function rowLabel(row: Row): string {
  if (row.evidence !== null) return evidenceDisplayLabel(row.evidence);
  const [first] = row.jobs;
  if (row.kind === "run") return first?.playbookId ?? "playbook run";
  return first?.capabilityId ?? row.id;
}

export const collectCmd = defineNounCommand({
  meta: {
    name: "collect",
    description:
      "List Collect's queue: Evidence, playbook runs and Jobs, newest activity first",
  },
  listArgs: { ...caseArg, ...listFlags(collectList) },
  required: ["case"],
  usageHelp: [
    "wd collect list -c <caseId> [--hidden] [--state running,failed] [--kind evidence,run,job] [--unprocessed] [--unattached] [--capability <capId|playbookId>] [--entity-id <uuid|slug>] [--search text] [--sort activity.desc|started.desc|started.asc]",
  ],
  list: async (args) => {
    const caseId = requireCaseId(args.case);
    const input = await listInputFromFlags(collectList, { caseId }, args);
    const page = await fetchListPage(
      async (window) => api().collect.list({ ...input, ...window }),
      args
    );
    const full = args.full === true;
    // `activity` is a moving key: a row whose activity dropped can reappear on a later page.
    const seen = new Set<string>();
    const rows = page.items.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
    emitList({
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        state: row.state,
        label: truncText(rowLabel(row), full),
        jobs: row.jobs.length,
        activity: row.activityAt.slice(0, 16),
        started: row.sortAt.slice(0, 16),
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      nextCursor: page.nextCursor,
      total: page.total,
      help: caseListHelp(caseId, [
        `wd collect list -c ${caseId} --state failed`,
      ]),
    });
  },
});
