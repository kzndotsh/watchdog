import { defineCommand } from "citty";

import { entityKindSchema } from "@watchdog/schemas";

import { api, emit, emitList, fail } from "../client";
import { resolveEntityId } from "../ids";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  pickDefined,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";

const LIST_COLUMNS = ["id", "kind", "name", "slug"];

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
    const caseId = String(args.case);
    const rows = await api().entities.list({ caseId });
    emitList({
      items: rows,
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
        const row = await api().entities.get({
          caseId: args.case,
          slug: args.slug,
        });
        emit(row);
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
        const slug =
          args.slug ??
          args.name
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, "-")
            .replaceAll(/^-|-$/g, "");
        const row = await api().entities.create({
          caseId: args.case,
          kind: entityKindSchema.parse(args.kind),
          name: args.name,
          slug,
        });
        emit(row);
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
          description: "Summary markdown (optional)",
        },
        notes: { type: "string", description: "Notes markdown (optional)" },
      },
      run: async ({ args }) => {
        if (
          (args.summary === undefined || args.summary === "") &&
          (args.notes === undefined || args.notes === "")
        ) {
          fail("USAGE", "Provide --summary and/or --notes", {
            help: [
              `wd entities update -c ${args.case} --entity ${args.entity} --summary "…"`,
            ],
          });
        }
        const entityId = await resolveEntityId(args.case, args.entity);
        const row = await api().entities.update({
          caseId: args.case,
          entityId,
          ...pickDefined({ summary: args.summary, notes: args.notes }),
        });
        emit(row);
      },
    }),
  },
});
