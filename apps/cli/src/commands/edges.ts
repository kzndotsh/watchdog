import { defineCommand } from "citty";

import {
  createEdgeInputSchema,
  deleteEdgeInputSchema,
  edgeRelatedToHasNotes,
  entityScopeInputSchema,
  optionalEdgePredicateSchema,
  predicateLabel,
  trimmedConfidenceTierSchema,
  trimmedEdgePredicateSchema,
  updateEdgeInputSchema,
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
  edgeDirectionLabel,
  edgePeerLabel,
  enrichEdgeDisplay,
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
  hasCliText,
  pickDefined,
  requiredCaseArg,
} from "../noun";
import {
  parseCliEnum,
  parseOptionalCliEnum,
  parseOptionalNullableTrimmedPatch,
} from "../parse-cli";

const LIST_COLUMNS = [
  "id",
  "dir",
  "dirLabel",
  "peer",
  "predicate",
  "predicateLabel",
  "confidence",
  "confidenceLabel",
];

function listHelp(caseId: string, entity: string): string[] {
  return entityListHelp(caseId, entity, [
    `wd edges create -c ${caseId} --from ${entity} --to <entity> --predicate <predicate> --confidence unverified --user-override`,
  ]);
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
    const caseId = requireCaseId(args.case);
    const entity = String(args.entity);
    const entityId = await resolveEntityId(caseId, entity);
    const rows = await api().edges.list(
      entityScopeInputSchema.parse({ caseId, entityId })
    );
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        dir: r.direction,
        dirLabel: edgeDirectionLabel(r.direction),
        peer: edgePeerLabel(r),
        predicate: r.predicate,
        predicateLabel: predicateLabel(r.predicate, r.direction),
        confidence: r.confidence,
        confidenceLabel: confidenceLabel(r.confidence),
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
        const caseId = requireCaseId(args.case);
        const confidence = parseCliEnum(
          trimmedConfidenceTierSchema,
          args.confidence,
          "--confidence",
          [
            `wd edges create -c ${caseId} --from ${args.from} --to ${args.to} --predicate owns --confidence unverified --user-override`,
          ]
        );
        refuseConfirmed(confidence);
        if (!hasCliText(args.predicate)) {
          fail("USAGE", "--predicate must not be blank", {
            help: [
              `wd edges create -c ${caseId} --from ${args.from} --to ${args.to} --predicate owns --confidence unverified --user-override`,
            ],
          });
        }
        const fromId = await resolveEntityId(caseId, args.from);
        const toId = await resolveEntityId(caseId, args.to);
        if (fromId === toId) {
          fail("USAGE", "from and to must differ", {
            help: [
              `wd edges create -c ${caseId} --from ${args.from} --to <other-entity> --predicate owns --confidence unverified --user-override`,
            ],
          });
        }
        const evidenceIds = parseIdList(args.evidence);
        const payload = createEdgeInputSchema.parse({
          caseId,
          fromId,
          toId,
          predicate: parseCliEnum(
            trimmedEdgePredicateSchema,
            args.predicate,
            "edge predicate"
          ),
          confidence,
          ...pickDefined({
            notes: args.notes,
            evidenceIds,
          }),
        });
        const row = await api().edges.create({
          ...payload,
          userOverride: true,
        });
        emit(enrichEdgeDisplay(row));
      },
    }),
    update: defineCommand({
      meta: {
        name: "update",
        description: "Update an edge (partial patch; --user-override required)",
      },
      args: {
        ...requiredCaseArg,
        edge: {
          type: "positional",
          description: "Edge ID",
          required: true,
        },
        from: { type: "string", description: "From entity slug or UUID" },
        to: { type: "string", description: "To entity slug or UUID" },
        predicate: { type: "string", description: "Edge predicate" },
        confidence: {
          type: "string",
          description: "unverified|possible (confirmed refused)",
        },
        notes: { type: "string", description: "Notes (empty to clear)" },
        evidence: {
          type: "string",
          description: "Evidence UUID (comma-separated)",
        },
        entity: {
          type: "string",
          description: "View entity slug or UUID (returned direction labels)",
        },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const caseId = requireCaseId(args.case);
        const edgeId = requireUuid(args.edge, "Edge ID");
        const hasFrom = args.from !== undefined;
        const hasTo = args.to !== undefined;
        if (hasFrom !== hasTo) {
          fail("USAGE", "--from and --to must be sent together", {
            help: [
              `wd edges update -c ${caseId} ${edgeId} --from jane --to acme --user-override`,
            ],
          });
        }
        const confidenceValue = guardChildWriteConfidence(args.confidence);
        const evidenceIds = parsePatchIdList(args.evidence);
        const predicateValue = parseOptionalCliEnum(
          optionalEdgePredicateSchema,
          args.predicate,
          "edge predicate"
        );
        if (args.predicate !== undefined && !hasCliText(args.predicate)) {
          fail("USAGE", "--predicate must not be blank", {
            help: [
              `wd edges update -c ${caseId} ${edgeId} --predicate owns --user-override`,
            ],
          });
        }
        const notes = parseOptionalNullableTrimmedPatch(args.notes);
        const touchesEndpoints = hasFrom && hasTo;
        if (
          !touchesEndpoints &&
          predicateValue === undefined &&
          confidenceValue === undefined &&
          notes === undefined &&
          evidenceIds === undefined &&
          args.entity === undefined
        ) {
          fail(
            "USAGE",
            "Provide at least one of --from/--to, --predicate, --confidence, --notes, or --evidence",
            {
              help: [
                `wd edges update -c ${caseId} ${edgeId} --notes "…" --user-override`,
              ],
            }
          );
        }
        if (
          !touchesEndpoints &&
          predicateValue === undefined &&
          confidenceValue === undefined &&
          notes === undefined &&
          evidenceIds === undefined &&
          args.entity !== undefined
        ) {
          fail(
            "USAGE",
            "--entity only sets graph view; provide --predicate, --confidence, --notes, or --evidence as well",
            {
              help: [
                `wd edges update -c ${caseId} ${edgeId} --entity jane --predicate owns --user-override`,
              ],
            }
          );
        }
        if (
          predicateValue === "related_to" &&
          notes !== undefined &&
          !edgeRelatedToHasNotes({
            predicate: "related_to",
            notes,
          })
        ) {
          fail("USAGE", "related_to requires notes", {
            help: [
              `wd edges update -c ${caseId} ${edgeId} --predicate related_to --notes "…" --user-override`,
            ],
          });
        }
        let fromId: string | undefined;
        let toId: string | undefined;
        if (touchesEndpoints) {
          fromId = await resolveEntityId(caseId, args.from);
          toId = await resolveEntityId(caseId, args.to);
          if (fromId === toId) {
            fail("USAGE", "from and to must differ", {
              help: [
                `wd edges update -c ${caseId} ${edgeId} --from ${args.from} --to <other-entity> --user-override`,
              ],
            });
          }
        }
        const viewEntityId =
          args.entity === undefined
            ? undefined
            : await resolveEntityId(caseId, args.entity);
        const parsed = updateEdgeInputSchema.safeParse({
          caseId,
          edgeId,
          ...pickDefined({
            fromId,
            toId,
            predicate: predicateValue,
            confidence: confidenceValue,
            evidenceIds,
            viewEntityId,
            ...(notes === undefined ? {} : { notes }),
          }),
        });
        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid edge patch";
          fail("USAGE", message, {
            help: [
              `wd edges update -c ${caseId} ${edgeId} --predicate owns --user-override`,
            ],
          });
        }
        const row = await api().edges.update({
          ...parsed.data,
          userOverride: true,
        });
        emit(enrichEdgeDisplay(row));
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
        const scope = deleteEdgeInputSchema.parse({
          caseId: requireCaseId(args.case),
          edgeId: requireUuid(args.edge, "Edge ID"),
        });
        if (args["dry-run"]) {
          emitOk({ dryRun: true, deleted: true, id: scope.edgeId });
          return;
        }
        await api().edges.delete({
          ...scope,
          userOverride: true,
        });
        emitOk({ deleted: true, id: scope.edgeId });
      },
    }),
  },
});
