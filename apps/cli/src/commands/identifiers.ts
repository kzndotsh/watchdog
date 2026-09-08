import { defineCommand } from "citty";

import {
  createIdentifierInputSchema,
  deleteIdentifierInputSchema,
  entityScopeInputSchema,
  optionalIdentifierStatusSchema,
  optionalIdentifierTypeSchema,
  trimmedConfidenceTierSchema,
  trimmedIdentifierStatusSchema,
  trimmedIdentifierTypeSchema,
  updateIdentifierInputSchema,
} from "@watchdog/schemas";

import { api, emit, emitList, emitOk, fail } from "../client";
import {
  guardChildWriteConfidence,
  refuseConfirmed,
  requireUserOverride,
  userOverrideArg,
} from "../custody";
import {
  confidenceLabel,
  displayStatusLabel,
  enrichIdentifierDisplay,
  identifierTypeLabel,
} from "../display";
import {
  parseIdList,
  parsePatchIdList,
  requireCaseId,
  requireUuid,
  resolveEntityId,
} from "../ids";
import { entityListHelp } from "../list-help";
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
import { parseCliEnum, parseOptionalCliEnum } from "../parse-cli";

const LIST_COLUMNS = [
  "id",
  "type",
  "typeLabel",
  "value",
  "confidence",
  "confidenceLabel",
  "status",
  "statusLabel",
];

function listHelp(caseId: string, entity: string): string[] {
  return entityListHelp(caseId, entity, [
    `wd identifiers create -c ${caseId} --entity ${entity} --type email --value "…" --confidence unverified --user-override`,
  ]);
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
    const caseId = requireCaseId(args.case);
    const entity = String(args.entity);
    const entityId = await resolveEntityId(caseId, entity);
    const rows = await api().identifiers.list(
      entityScopeInputSchema.parse({ caseId, entityId })
    );
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        typeLabel: identifierTypeLabel(r.type),
        value: r.value,
        confidence: r.confidence,
        confidenceLabel: confidenceLabel(r.confidence),
        status: r.status,
        statusLabel: displayStatusLabel(r.status),
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
        const caseId = requireCaseId(args.case);
        const confidence = parseCliEnum(
          trimmedConfidenceTierSchema,
          args.confidence,
          "--confidence",
          [
            `wd identifiers create -c ${caseId} --entity ${args.entity} --type email --value "…" --confidence unverified --user-override`,
          ]
        );
        refuseConfirmed(confidence);
        const entityId = await resolveEntityId(caseId, args.entity);
        const evidenceIds = parseIdList(args.evidence);
        const payload = createIdentifierInputSchema.parse({
          caseId,
          entityId,
          type: parseCliEnum(
            trimmedIdentifierTypeSchema,
            args.type,
            "identifier type"
          ),
          value: args.value,
          confidence,
          status: parseCliEnum(
            trimmedIdentifierStatusSchema,
            args.status,
            "identifier status"
          ),
          ...pickDefined({
            platform: args.platform,
            notes: args.notes,
            evidenceIds,
          }),
        });
        const row = await api().identifiers.create({
          ...payload,
          userOverride: true,
        });
        emit(enrichIdentifierDisplay(row));
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
        platform: { type: "string", description: "Platform (empty to clear)" },
        status: { type: "string", description: "Status" },
        confidence: {
          type: "string",
          description: "unverified|possible (confirmed refused)",
        },
        notes: { type: "string", description: "Notes (empty to clear)" },
        evidence: {
          type: "string",
          description: "Evidence UUID (comma-separated)",
        },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const caseId = requireCaseId(args.case);
        const identifierId = requireUuid(args.identifier, "Identifier ID");
        const confidenceValue = guardChildWriteConfidence(args.confidence);
        const evidenceIds = parsePatchIdList(args.evidence);
        const typeValue = parseOptionalCliEnum(
          optionalIdentifierTypeSchema,
          args.type,
          "identifier type"
        );
        const statusValue = parseOptionalCliEnum(
          optionalIdentifierStatusSchema,
          args.status,
          "identifier status"
        );
        const parsed = updateIdentifierInputSchema.safeParse({
          caseId,
          identifierId,
          ...(args.value === undefined ? {} : { value: args.value }),
          ...(typeValue === undefined ? {} : { type: typeValue }),
          ...(statusValue === undefined ? {} : { status: statusValue }),
          ...(confidenceValue === undefined
            ? {}
            : { confidence: confidenceValue }),
          ...(evidenceIds === undefined ? {} : { evidenceIds }),
          ...(args.platform === undefined ? {} : { platform: args.platform }),
          ...(args.notes === undefined ? {} : { notes: args.notes }),
        });
        if (!parsed.success) {
          fail(
            "USAGE",
            "Provide at least one of --value, --type, --platform, --status, --confidence, --notes, or --evidence",
            {
              help: [
                `wd identifiers update -c ${caseId} ${identifierId} --value "…" --user-override`,
              ],
            }
          );
        }
        const row = await api().identifiers.update({
          ...parsed.data,
          userOverride: true,
        });
        emit(enrichIdentifierDisplay(row));
      },
    }),
    delete: defineCommand({
      meta: {
        name: "delete",
        description: "Delete an identifier (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        identifier: {
          type: "positional",
          description: "Identifier ID",
          required: true,
        },
        ...dryRunArg,
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const scope = deleteIdentifierInputSchema.parse({
          caseId: requireCaseId(args.case),
          identifierId: requireUuid(args.identifier, "Identifier ID"),
        });
        if (args["dry-run"]) {
          emitOk({ dryRun: true, deleted: true, id: scope.identifierId });
          return;
        }
        await api().identifiers.delete({
          ...scope,
          userOverride: true,
        });
        emitOk({ deleted: true, id: scope.identifierId });
      },
    }),
  },
});
