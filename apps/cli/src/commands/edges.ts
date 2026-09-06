import { defineCommand } from "citty";

import { confidenceTierSchema, edgePredicateSchema } from "@watchdog/schemas";

import { api, emit, emitList, emitOk } from "../client";
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
  dryRunArg,
  entityArg,
  pickDefined,
  requiredCaseArg,
} from "../noun";

const LIST_COLUMNS = ["id", "from", "to", "predicate", "confidence"];

function listHelp(caseId: string, entity: string): string[] {
  return [
    `wd edges create -c ${caseId} --from ${entity} --to <entity> --predicate <predicate> --confidence unverified --user-override`,
  ];
}

export const edgesCmd = defineNounCommand({
  meta: {
    name: "edges",
    description:
      "Connections (graph edges) on an entity (writes need --user-override)",
  },
  listArgs: { ...caseArg, ...entityArg },
  required: ["case", "entity"],
  usageHelp: ["wd edges list -c <caseId> --entity <slug>"],
  list: async (args) => {
    const caseId = String(args.case);
    const entity = String(args.entity);
    const entityId = await resolveEntityId(caseId, entity);
    const rows = await api().edges.list({ caseId, entityId });
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        from: r.fromId,
        to: r.toId,
        predicate: r.predicate,
        confidence: r.confidence,
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
        description: "Create an edge (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        from: {
          type: "string",
          description: "From entity slug or UUID",
          required: true,
        },
        to: {
          type: "string",
          description: "To entity slug or UUID",
          required: true,
        },
        predicate: {
          type: "string",
          description: "Edge predicate",
          required: true,
        },
        confidence: {
          type: "string",
          description: "unverified|possible (confirmed refused)",
          required: true,
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
        const fromId = await resolveEntityId(args.case, args.from);
        const toId = await resolveEntityId(args.case, args.to);
        const evidenceIds = parseIdList(args.evidence);
        const row = await api().edges.create({
          caseId: args.case,
          fromId,
          toId,
          predicate: edgePredicateSchema.parse(args.predicate),
          confidence: confidenceTierSchema.parse(args.confidence),
          userOverride: true,
          ...pickDefined({ notes: args.notes, evidenceIds }),
        });
        emit(row);
      },
    }),
    delete: defineCommand({
      meta: {
        name: "delete",
        description: "Delete an edge (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        edge: {
          type: "positional",
          description: "Edge ID",
          required: true,
        },
        ...dryRunArg,
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        if (args["dry-run"]) {
          emitOk({ dryRun: true, deleted: true, id: args.edge });
          return;
        }
        await api().edges.delete({
          caseId: args.case,
          edgeId: args.edge,
          userOverride: true,
        });
        emitOk({ deleted: true, id: args.edge });
      },
    }),
  },
});
