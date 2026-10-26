import { defineCommand } from "citty";

import {
  createEdgeInputSchema,
  deleteEdgeInputSchema,
  edgeList,
  updateEdgeInputSchema,
} from "@watchdog/schemas/graph";
import {
  edgeRelatedToHasNotes,
  optionalEdgePredicateSchema,
  predicateLabel,
  trimmedConfidenceTierSchema,
  trimmedEdgePredicateSchema,
} from "@watchdog/schemas/shared";

import { api, emit, emitList, emitOk, fail } from "../client";
import {
  guardChildWriteConfidence,
  refuseConfirmed,
  requireUserOverride,
  userOverrideArg,
} from "../custody";
import { confidenceLabel, enrichEdgeDisplay } from "../display";
import {
  parseIdList,
  parsePatchIdList,
  requireCaseId,
  requireUuid,
  resolveEntityId,
} from "../ids";
import { listFlags, listInputFromFlags } from "../list-flags";
import { caseListHelp } from "../list-help";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  dryRunArg,
  hasCliText,
  pickDefined,
  requiredCaseArg,
} from "../noun";
import { fetchListPage } from "../paging";
import {
  parseCliEnum,
  parseOptionalCliEnum,
  parseOptionalNullableTrimmedPatch,
} from "../parse-cli";
import { expectedVersionArg, resolveExpectedVersion } from "../versions";

const LIST_COLUMNS = [
  "id",
  "version",
  "from",
  "predicate",
  "predicateLabel",
  "to",
  "confidence",
  "confidenceLabel",
];

function listHelp(caseId: string): string[] {
  return caseListHelp(caseId, [
    `wd edges create -c ${caseId} --from <entity> --to <entity> --predicate <predicate> --confidence unverified --user-override`,
  ]);
}

export const edgesCmd = defineNounCommand({
  meta: {
    name: "edges",
    description:
      "Connections (graph edges) on an entity (writes need --user-override)",
  },
  listArgs: { ...caseArg, ...listFlags(edgeList) },
  required: ["case"],
  usageHelp: [
    "wd edges list -c <caseId> [--entity-id <uuid|slug>] [--predicate owns,leads] [--search text] [--sort updated.desc]",
  ],
  list: async (args) => {
    const caseId = requireCaseId(args.case);
    const input = await listInputFromFlags(edgeList, { caseId }, args);
    const page = await fetchListPage(
      async (window) => api().edges.list({ ...input, ...window }),
      args
    );
    emitList({
      items: page.items.map((r) => ({
        id: r.id,
        version: r.version,
        from: r.fromSlug,
        predicate: r.predicate,
        predicateLabel: predicateLabel(r.predicate),
        to: r.toSlug,
        confidence: r.confidence,
        confidenceLabel: confidenceLabel(r.confidence),
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
        ...expectedVersionArg,
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
        const expectedVersion = await resolveExpectedVersion({
          given: args["expected-version"],
          noun: "Edge",
          id: edgeId,
          help: [`wd edges list -c ${caseId} --entity <slug>`],
          read: async () => {
            const [row] = await api().edges.getMany({ caseId, ids: [edgeId] });
            return row?.version;
          },
        });
        const parsed = updateEdgeInputSchema.safeParse({
          caseId,
          edgeId,
          expectedVersion,
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
