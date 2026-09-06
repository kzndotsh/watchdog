import { defineCommand } from "citty";

import {
  confidenceTierSchema,
  identifierStatusSchema,
  identifierTypeSchema,
} from "@watchdog/schemas";

import { api, emit, emitList } from "../client";
import {
  refuseConfirmed,
  requireUserOverride,
  userOverrideArg,
} from "../custody";
import { parseIdList, resolveEntityId } from "../ids";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  entityArg,
  pickDefined,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";

const LIST_COLUMNS = ["id", "type", "value", "confidence", "status"];

function listHelp(caseId: string, entity: string): string[] {
  return [
    `wd identifiers create -c ${caseId} --entity ${entity} --type email --value "…" --confidence unverified --user-override`,
  ];
}

export const identifiersCmd = defineNounCommand({
  meta: {
    name: "identifiers",
    description: "Identifiers on an entity (writes need --user-override)",
  },
  listArgs: { ...caseArg, ...entityArg },
  required: ["case", "entity"],
  usageHelp: ["wd identifiers list -c <caseId> --entity <slug>"],
  list: async (args) => {
    const caseId = String(args.case);
    const entity = String(args.entity);
    const entityId = await resolveEntityId(caseId, entity);
    const rows = await api().identifiers.list({ caseId, entityId });
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        value: r.value,
        confidence: r.confidence,
        status: r.status,
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
        description: "Create an identifier (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        ...requiredEntityArg,
        type: {
          type: "string",
          description: "Identifier type",
          required: true,
        },
        value: {
          type: "string",
          description: "Identifier value",
          required: true,
        },
        confidence: {
          type: "string",
          description: "unverified|possible (confirmed refused)",
          required: true,
        },
        platform: { type: "string", description: "Optional platform" },
        status: {
          type: "string",
          description: "Identifier status",
          default: "unknown",
        },
        notes: { type: "string", description: "Optional notes" },
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
        const row = await api().identifiers.create({
          caseId: args.case,
          entityId,
          type: identifierTypeSchema.parse(args.type),
          value: args.value,
          confidence: confidenceTierSchema.parse(args.confidence),
          status: identifierStatusSchema.parse(args.status),
          userOverride: true,
          ...pickDefined({
            platform: args.platform,
            notes: args.notes,
            evidenceIds,
          }),
        });
        emit(row);
      },
    }),
    update: defineCommand({
      meta: {
        name: "update",
        description: "Update an identifier (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        identifier: {
          type: "positional",
          description: "Identifier ID",
          required: true,
        },
        value: { type: "string", description: "Identifier value" },
        type: { type: "string", description: "Identifier type" },
        platform: { type: "string", description: "Platform" },
        status: { type: "string", description: "Status" },
        confidence: {
          type: "string",
          description: "unverified|possible (confirmed refused)",
        },
        notes: { type: "string", description: "Notes" },
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
        const typeValue =
          args.type !== undefined && args.type !== ""
            ? identifierTypeSchema.parse(args.type)
            : undefined;
        const statusValue =
          args.status !== undefined && args.status !== ""
            ? identifierStatusSchema.parse(args.status)
            : undefined;
        const confidenceValue =
          args.confidence !== undefined && args.confidence !== ""
            ? confidenceTierSchema.parse(args.confidence)
            : undefined;
        const row = await api().identifiers.update({
          caseId: args.case,
          identifierId: args.identifier,
          userOverride: true,
          ...pickDefined({
            value: args.value,
            type: typeValue,
            platform: args.platform,
            status: statusValue,
            confidence: confidenceValue,
            notes: args.notes,
            evidenceIds,
          }),
        });
        emit(row);
      },
    }),
  },
});
