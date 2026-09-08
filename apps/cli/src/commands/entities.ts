import { defineCommand } from "citty";

import {
  caseScopeInputSchema,
  createEntityInputSchema,
  entitySlugScopeInputSchema,
  trimmedEntityKindSchema,
  updateEntityInputSchema,
} from "@watchdog/schemas";

import { api, emit, emitList, fail } from "../client";
import { entityKindLabel, enrichEntityDisplay } from "../display";
import { requireCaseId, resolveEntityId } from "../ids";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";
import { parseCliEnum, parseOptionalNullableTrimmedPatch } from "../parse-cli";

const LIST_COLUMNS = ["id", "kind", "kindLabel", "name", "slug"];

function listHelp(caseId: string): string[] {
  return [
    `wd entities create -c ${caseId} -k person -n "Full Name"`,
    `wd entities get -c ${caseId} <slug>`,
  ];
}

export const entitiesCmd = defineNounCommand({
  meta: { name: "entities", description: "Manage entities in a case" },
  listArgs: { ...caseArg },
  required: ["case"],
  usageHelp: ["wd entities list -c <caseId>"],
  list: async (args) => {
    const caseId = requireCaseId(args.case);
    const rows = await api().entities.list(
      caseScopeInputSchema.parse({ caseId })
    );
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        kindLabel: entityKindLabel(r.kind),
        name: r.name,
        slug: r.slug,
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      help: listHelp(caseId),
    });
  },
  mutations: {
    get: defineCommand({
      meta: { name: "get", description: "Get entity by slug" },
      args: {
        ...requiredCaseArg,
        slug: {
          type: "positional",
          description: "Entity slug",
          required: true,
        },
      },
      run: async ({ args }) => {
        const scope = entitySlugScopeInputSchema.parse({
          caseId: requireCaseId(args.case),
          slug: args.slug,
        });
        const row = await api().entities.get(scope);
        emit(enrichEntityDisplay(row));
      },
    }),
    create: defineCommand({
      meta: { name: "create", description: "Create an entity" },
      args: {
        ...requiredCaseArg,
        kind: {
          type: "string",
          alias: "k",
          description: "Entity kind (person|infra|org)",
          required: true,
        },
        name: {
          type: "string",
          alias: "n",
          description: "Entity name",
          required: true,
        },
        slug: { type: "string", alias: "s", description: "Entity slug" },
      },
      run: async ({ args }) => {
        const caseId = requireCaseId(args.case);
        const payload = createEntityInputSchema.parse({
          caseId,
          kind: parseCliEnum(
            trimmedEntityKindSchema,
            args.kind,
            "entity kind",
            [`wd entities create -c ${caseId} -k person -n "Full Name"`]
          ),
          name: args.name,
          slug: args.slug,
        });
        const row = await api().entities.create(payload);
        emit(enrichEntityDisplay(row));
      },
    }),
    update: defineCommand({
      meta: {
        name: "update",
        description: "Update entity summary/notes",
      },
      args: {
        ...requiredCaseArg,
        ...requiredEntityArg,
        summary: {
          type: "string",
          description: "Summary markdown (empty to clear)",
        },
        notes: {
          type: "string",
          description: "Notes markdown (empty to clear)",
        },
      },
      run: async ({ args }) => {
        const caseId = requireCaseId(args.case);
        const touchesSummary = args.summary !== undefined;
        const touchesNotes = args.notes !== undefined;
        if (!touchesSummary && !touchesNotes) {
          fail("USAGE", "Provide --summary and/or --notes", {
            help: [
              `wd entities update -c ${caseId} --entity ${args.entity} --summary "…"`,
            ],
          });
        }
        const entityId = await resolveEntityId(caseId, args.entity);
        const summary = parseOptionalNullableTrimmedPatch(args.summary);
        const notes = parseOptionalNullableTrimmedPatch(args.notes);
        const parsed = updateEntityInputSchema.safeParse({
          caseId,
          entityId,
          ...(summary === undefined ? {} : { summary }),
          ...(notes === undefined ? {} : { notes }),
        });
        if (!parsed.success) {
          fail("USAGE", "Provide --summary and/or --notes", {
            help: [
              `wd entities update -c ${caseId} --entity ${args.entity} --summary "…"`,
            ],
          });
        }
        const row = await api().entities.update(parsed.data);
        emit(enrichEntityDisplay(row));
      },
    }),
  },
});
