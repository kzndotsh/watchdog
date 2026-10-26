import { defineCommand } from "citty";

import {
  createProposalInputSchema,
  proposalList,
} from "@watchdog/schemas/jobs";

import { api, emit, emitList, truncText } from "../client";
import {
  displayStatusLabel,
  enrichProposalDisplay,
  proposalListSummary,
} from "../display";
import { withExamples } from "../examples";
import { parseIdList, requireCaseId } from "../ids";
import { listFlags, listInputFromFlags } from "../list-flags";
import { caseListHelp } from "../list-help";
import { loadPatch } from "../load-patch";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  requiredCaseArg,
} from "../noun";
import { fetchListPage } from "../paging";

const LIST_COLUMNS = ["id", "status", "statusLabel", "summary", "created"];

function listHelp(caseId: string): string[] {
  return caseListHelp(caseId, [
    `wd proposals create -c ${caseId} --patch-file <path>`,
  ]);
}

export const proposalsCmd = defineNounCommand({
  meta: {
    name: "proposals",
    description:
      "List and create proposals (a person accepts or rejects them in Triage)",
  },
  listArgs: { ...caseArg, ...listFlags(proposalList) },
  required: ["case"],
  usageHelp: [
    "wd proposals list -c <caseId> [--status pending] [--search text] [--sort created.asc]",
  ],
  list: async (args) => {
    const caseId = requireCaseId(args.case);
    const input = await listInputFromFlags(proposalList, { caseId }, args);
    const page = await fetchListPage(
      async (window) => api().proposals.listForCase({ ...input, ...window }),
      args
    );
    const full = args.full === true;
    emitList({
      items: page.items.map((r) => ({
        id: r.id,
        status: r.status,
        statusLabel: displayStatusLabel(r.status),
        summary: truncText(proposalListSummary(r), full),
        created: r.createdAt.slice(0, 16),
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      nextCursor: page.nextCursor,
      total: page.total,
      help: listHelp(caseId),
    });
  },
  mutations: {
    create: defineCommand({
      meta: {
        name: "create",
        description: withExamples("Create an agent Proposal (lands in Inbox)", [
          "wd proposals create -c <caseId> --patch-file ./patch.json",
          "cat patch.json | wd proposals create -c <caseId> --stdin",
        ]),
      },
      args: {
        ...requiredCaseArg,
        patch: {
          type: "string",
          description: "Patch JSON array string ('-' or omit for stdin)",
        },
        "patch-file": {
          type: "string",
          description: "Path to patch JSON file",
        },
        stdin: {
          type: "boolean",
          description: "Read patch JSON from stdin",
          default: false,
        },
        summary: { type: "string", description: "Optional summary" },
        evidence: {
          type: "string",
          description: "Evidence UUID (comma-separated for multiple)",
        },
      },
      run: async ({ args }) => {
        const caseId = requireCaseId(args.case);
        const patch = loadPatch(args);
        const evidenceIds = parseIdList(args.evidence);
        const row = await api().proposals.create(
          createProposalInputSchema.parse({
            caseId,
            patch,
            summary: args.summary,
            evidenceIds,
          })
        );
        emit(enrichProposalDisplay(row));
      },
    }),
  },
});
