import { defineCommand } from "citty";

import { confidenceTierSchema, proposalStatusSchema } from "@watchdog/schemas";

import { api, emit, emitList, emitOk, truncText } from "../client";
import { withExamples } from "../examples";
import { parseIdList } from "../ids";
import { loadPatch } from "../load-patch";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  dryRunArg,
  pickDefined,
  requiredCaseArg,
} from "../noun";

const LIST_COLUMNS = ["id", "status", "summary", "created"];

function listHelp(caseId: string): string[] {
  return [
    `wd proposals accept -c ${caseId} <proposalId>`,
    `wd proposals create -c ${caseId} --patch-file <path>`,
  ];
}

export const proposalsCmd = defineNounCommand({
  meta: { name: "proposals", description: "Manage proposals (inbox)" },
  listArgs: {
    ...caseArg,
    status: {
      type: "string",
      alias: "s",
      description: "Filter by status (pending|accepted|rejected)",
      default: "pending",
    },
  },
  required: ["case"],
  usageHelp: ["wd proposals list -c <caseId>"],
  list: async (args) => {
    const caseId = String(args.case);
    const rows = await api().proposals.listForCase({
      caseId,
      status: proposalStatusSchema.parse(args.status ?? "pending"),
    });
    const full = args.full === true;
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        summary: truncText(r.summary ?? "—", full),
        created: r.createdAt.slice(0, 16),
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
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
        const patch = loadPatch(args);
        const evidenceIds = parseIdList(args.evidence);
        const row = await api().proposals.create({
          caseId: args.case,
          patch,
          ...pickDefined({ summary: args.summary, evidenceIds }),
        });
        emit(row);
      },
    }),
    accept: defineCommand({
      meta: { name: "accept", description: "Accept a proposal" },
      args: {
        ...requiredCaseArg,
        proposal: {
          type: "positional",
          description: "Proposal ID",
          required: true,
        },
        confidence: {
          type: "string",
          description: "Confidence tier (unverified|possible|confirmed)",
        },
      },
      run: async ({ args }) => {
        const confidence =
          args.confidence !== undefined && args.confidence !== ""
            ? confidenceTierSchema.parse(args.confidence)
            : undefined;
        const row = await api().proposals.accept({
          caseId: args.case,
          proposalId: args.proposal,
          ...pickDefined({ confidence }),
        });
        emit(row);
      },
    }),
    reject: defineCommand({
      meta: { name: "reject", description: "Reject a proposal" },
      args: {
        ...requiredCaseArg,
        proposal: {
          type: "positional",
          description: "Proposal ID",
          required: true,
        },
        reason: {
          type: "string",
          alias: "r",
          description: "Rejection reason (optional)",
        },
        ...dryRunArg,
      },
      run: async ({ args }) => {
        if (args["dry-run"]) {
          emitOk({ dryRun: true, id: args.proposal, rejected: true });
          return;
        }
        const row = await api().proposals.reject({
          caseId: args.case,
          proposalId: args.proposal,
          ...pickDefined({ reason: args.reason }),
        });
        emit(row);
      },
    }),
  },
});
