import { defineCommand } from "citty";

import {
  createEntityInputSchema,
  entityList,
  entitySlugScopeInputSchema,
  updateEntityInputSchema,
} from "@watchdog/schemas/graph";
import { trimmedEntityKindSchema } from "@watchdog/schemas/shared";

import { api, emit, emitList, fail } from "../client";
import { entityKindLabel, enrichEntityDisplay } from "../display";
import { requireCaseId, resolveEntityId } from "../ids";
import { listFlags, listInputFromFlags } from "../list-flags";
import { caseListHelp } from "../list-help";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";
import { fetchListPage } from "../paging";
import { parseCliEnum, parseOptionalNullableTrimmedPatch } from "../parse-cli";
import { expectedVersionArg, resolveExpectedVersion } from "../versions";

const LIST_COLUMNS = ["id", "version", "kind", "kindLabel", "name", "slug"];

function listHelp(caseId: string): string[] {
  return caseListHelp(caseId, [
    `wd entities create -c ${caseId} -k person -n "Full Name"`,
    `wd entities get -c ${caseId} <slug>`,
  ]);
}

export const entitiesCmd = defineNounCommand({
  meta: { name: "entities", description: "Manage entities in a case" },
  listArgs: { ...caseArg, ...listFlags(entityList) },
  required: ["case"],
  usageHelp: [
    "wd entities list -c <caseId> [--search text] [--kind person,org] [--sort updated.desc]",
  ],
  list: async (args) => {
    const caseId = requireCaseId(args.case);
    const input = await listInputFromFlags(entityList, { caseId }, args);
    const page = await fetchListPage(
      async (window) => api().entities.list({ ...input, ...window }),
      args
    );
    emitList({
      items: page.items.map((r) => ({
        id: r.id,
        version: r.version,
        kind: r.kind,
        kindLabel: entityKindLabel(r.kind),
        name: r.name,
        slug: r.slug,
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      nextCursor: page.nextCursor,
      total: page.total,
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
        ...expectedVersionArg,
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
        const expectedVersion = await resolveExpectedVersion({
          given: args["expected-version"],
          noun: "Entity",
          id: entityId,
          help: [`wd entities list -c ${caseId}`],
          read: async () => {
            const [row] = await api().entities.getMany({
              caseId,
              ids: [entityId],
            });
            return row?.version;
          },
        });
        const parsed = updateEntityInputSchema.safeParse({
          caseId,
          entityId,
          expectedVersion,
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
