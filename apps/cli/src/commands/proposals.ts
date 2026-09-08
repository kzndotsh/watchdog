import { defineCommand } from "citty";

import {
  acceptProposalInputSchema,
  createProposalInputSchema,
  listProposalsInputSchema,
  rejectProposalInputSchema,
  trimmedConfidenceTierSchema,
  trimmedProposalStatusSchema,
} from "@watchdog/schemas";

import { api, emit, emitList, emitOk, truncText } from "../client";
import {
  displayStatusLabel,
  enrichProposalDisplay,
  proposalListSummary,
} from "../display";
import { withExamples } from "../examples";
import { parseIdList, requireCaseId, requireUuid } from "../ids";
import { loadPatch } from "../load-patch";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  dryRunArg,
  requiredCaseArg,
} from "../noun";
import { parseCliEnum, parseOptionalCliEnum } from "../parse-cli";

const LIST_COLUMNS = ["id", "status", "statusLabel", "summary", "created"];

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
    const caseId = requireCaseId(args.case);
    const status = parseCliEnum(
      trimmedProposalStatusSchema,
      typeof args.status === "string" ? args.status : "pending",
      "proposal status",
      [`wd proposals list -c ${caseId} -s pending`]
    );
    const rows = await api().proposals.listForCase(
      listProposalsInputSchema.parse({ caseId, status })
    );
    const full = args.full === true;
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        statusLabel: displayStatusLabel(r.status),
        summary: truncText(proposalListSummary(r), full),
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
        sharedEvidence: {
          type: "string",
          description: "Shared evidence UUID (comma-separated)",
        },
        attestation: {
          type: "string",
          description: "Attestation text stored when accepting",
        },
      },
      run: async ({ args }) => {
        const caseId = requireCaseId(args.case);
        const proposalId = requireUuid(args.proposal, "Proposal ID");
        const confidence = parseOptionalCliEnum(
          trimmedConfidenceTierSchema,
          args.confidence,
          "--confidence (unverified|possible|confirmed)",
          [`wd proposals accept -c ${caseId} ${proposalId}`]
        );
        const sharedEvidenceIds = parseIdList(args.sharedEvidence);
        const row = await api().proposals.accept(
          acceptProposalInputSchema.parse({
            caseId,
            proposalId,
            confidence,
            sharedEvidenceIds,
            attestationText: args.attestation,
          })
        );
        emit(enrichProposalDisplay(row));
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
        const caseId = requireCaseId(args.case);
        const proposalId = requireUuid(args.proposal, "Proposal ID");
        if (args["dry-run"]) {
          emitOk({ dryRun: true, id: proposalId, rejected: true });
          return;
        }
        const row = await api().proposals.reject(
          rejectProposalInputSchema.parse({
            caseId,
            proposalId,
            reason: args.reason,
          })
        );
        emit(enrichProposalDisplay(row));
      },
    }),
  },
});
