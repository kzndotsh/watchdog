import { defineCommand } from "citty";

import {
  claimClassSchema,
  confidenceTierSchema,
  retractKindSchema,
} from "@watchdog/schemas";

import { api, emit, emitList, emitOk, truncText } from "../client";
import {
  refuseConfirmed,
  requireUserOverride,
  userOverrideArg,
} from "../custody";
import { withExamples } from "../examples";
import { parseIdList, resolveEntityId } from "../ids";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  dryRunArg,
  entityArg,
  pickDefined,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";

const LIST_COLUMNS = ["id", "confidence", "class", "text", "retracted"];

function listHelp(caseId: string, entity: string): string[] {
  return [
    `wd claims create -c ${caseId} --entity ${entity} --text "…" --confidence unverified --user-override`,
  ];
}

export const claimsCmd = defineNounCommand({
  meta: {
    name: "claims",
    description: "Claims on an entity (writes need --user-override)",
  },
  listArgs: {
    ...caseArg,
    ...entityArg,
    retracted: {
      type: "boolean",
      description: "Include retracted claims",
      default: false,
    },
  },
  required: ["case", "entity"],
  usageHelp: ["wd claims list -c <caseId> --entity <slug>"],
  list: async (args) => {
    const caseId = String(args.case);
    const entity = String(args.entity);
    const entityId = await resolveEntityId(caseId, entity);
    const rows = await api().claims.list({
      caseId,
      entityId,
      includeRetracted: asBoolean(args.retracted) ?? false,
    });
    const full = args.full === true;
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        confidence: r.confidence,
        class: r.class,
        text: truncText(r.text, full),
        retracted: r.retracted,
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      help: listHelp(caseId, entity),
    });
  },
  mutations: {
    create: defineCommand({
      meta: {
        name: "create",
        description: withExamples("Create a claim (--user-override required)", [
          'wd claims create -c <caseId> --entity <slug> --text "…" --confidence unverified --user-override',
        ]),
      },
      args: {
        ...requiredCaseArg,
        ...requiredEntityArg,
        text: { type: "string", description: "Claim text", required: true },
        confidence: {
          type: "string",
          description: "unverified|possible (confirmed refused)",
          required: true,
        },
        class: {
          type: "string",
          description: "Claim class",
          default: "observation",
        },
        evidence: {
          type: "string",
          description: "Evidence UUID (comma-separated)",
        },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        refuseConfirmed(confidenceTierSchema.parse(args.confidence));
        const entityId = await resolveEntityId(args.case, args.entity);
        const evidenceIds = parseIdList(args.evidence);
        const row = await api().claims.create({
          caseId: args.case,
          entityId,
          text: args.text,
          confidence: confidenceTierSchema.parse(args.confidence),
          class: claimClassSchema.parse(args.class),
          userOverride: true,
          ...pickDefined({ evidenceIds }),
        });
        emit(row);
      },
    }),
    update: defineCommand({
      meta: {
        name: "update",
        description: "Update a claim (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        claim: {
          type: "positional",
          description: "Claim ID",
          required: true,
        },
        text: { type: "string", description: "Claim text" },
        class: { type: "string", description: "Claim class" },
        confidence: {
          type: "string",
          description: "unverified|possible (confirmed refused)",
        },
        evidence: {
          type: "string",
          description: "Evidence UUID (comma-separated)",
        },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        refuseConfirmed(confidenceTierSchema.parse(args.confidence));
        const evidenceIds = parseIdList(args.evidence);
        const classValue =
          args.class !== undefined && args.class !== ""
            ? claimClassSchema.parse(args.class)
            : undefined;
        const confidenceValue =
          args.confidence !== undefined && args.confidence !== ""
            ? confidenceTierSchema.parse(args.confidence)
            : undefined;
        const row = await api().claims.update({
          caseId: args.case,
          claimId: args.claim,
          userOverride: true,
          ...pickDefined({
            text: args.text,
            class: classValue,
            confidence: confidenceValue,
            evidenceIds,
          }),
        });
        emit(row);
      },
    }),
    retract: defineCommand({
      meta: {
        name: "retract",
        description: "Retract a claim (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        claim: {
          type: "positional",
          description: "Claim ID",
          required: true,
        },
        kind: {
          type: "string",
          description: "Retract kind",
          required: true,
        },
        reason: {
          type: "string",
          description: "Reason",
          required: true,
        },
        ...dryRunArg,
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const kind = retractKindSchema.parse(args.kind);
        if (args["dry-run"]) {
          emitOk({ dryRun: true, id: args.claim, kind, reason: args.reason });
          return;
        }
        const row = await api().claims.retract({
          caseId: args.case,
          claimId: args.claim,
          kind,
          reason: args.reason,
          userOverride: true,
        });
        emit(row);
      },
    }),
  },
});
