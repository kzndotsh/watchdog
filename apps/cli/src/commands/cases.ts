import { defineCommand } from "citty";

import {
  createCaseInputSchema,
  deleteCaseInputSchema,
  updateCaseInputSchema,
} from "@watchdog/schemas/cases";

import { api, emit, emitList, fail } from "../client";
import { enrichCaseDisplay } from "../display";
import { requireUuid } from "../ids";
import { asBoolean, defineNounCommand, pickDefined } from "../noun";
import { fetchListPage } from "../paging";

const LIST_COLUMNS = [
  "id",
  "name",
  "slug",
  "allowThirdPartyEgress",
  "egressLabel",
];
const LIST_HELP = ["wd cases create -n <name>", "wd cases get <id>"];

export const casesCmd = defineNounCommand({
  meta: { name: "cases", description: "Manage cases" },
  listArgs: {},
  required: [],
  usageHelp: LIST_HELP,
  list: async (args) => {
    const page = await fetchListPage(
      async (params) => api().cases.list(params),
      args
    );
    emitList({
      items: page.items.map((r) => enrichCaseDisplay(r)),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      nextCursor: page.nextCursor,
      help: LIST_HELP,
    });
  },
  mutations: {
    get: defineCommand({
      meta: { name: "get", description: "Get a case by ID" },
      args: {
        id: { type: "positional", description: "Case ID", required: true },
      },
      run: async ({ args }) => {
        const scope = deleteCaseInputSchema.parse({
          caseId: requireUuid(args.id, "Case ID"),
        });
        const row = await api().cases.get(scope);
        emit(enrichCaseDisplay(row));
      },
    }),
    create: defineCommand({
      meta: { name: "create", description: "Create a case" },
      args: {
        name: {
          type: "string",
          alias: "n",
          description: "Case name",
          required: true,
        },
        slug: {
          type: "string",
          alias: "s",
          description: "Case slug (defaults from name)",
        },
        description: {
          type: "string",
          alias: "d",
          description: "Optional description",
        },
      },
      run: async ({ args }) => {
        const fields = createCaseInputSchema.parse({
          name: args.name,
          ...pickDefined({
            slug: args.slug,
            description: args.description,
          }),
        });
        const row = await api().cases.create(fields);
        emit(enrichCaseDisplay(row));
      },
    }),
    update: defineCommand({
      meta: {
        name: "update",
        description:
          "Update case name (regenerates slug) or description. The third-party egress switch is changed in the web app by an owner or admin, not with a key",
      },
      args: {
        id: { type: "positional", description: "Case ID", required: true },
        name: {
          type: "string",
          alias: "n",
          description: "New case name (also regenerates slug)",
        },
        description: {
          type: "string",
          alias: "d",
          description: "New description (empty to clear)",
        },
      },
      run: async ({ args }) => {
        const caseId = requireUuid(args.id, "Case ID");
        if (args.name !== undefined && args.name.trim() === "") {
          fail("USAGE", "Case name must not be blank", {
            help: ["wd cases update <id> --name <name>"],
          });
        }
        const touchesDescription = args.description !== undefined;
        const parsed = updateCaseInputSchema.safeParse({
          caseId,
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(touchesDescription ? { description: args.description } : {}),
        });
        if (!parsed.success) {
          fail("USAGE", "Provide at least one of --name or --description", {
            help: ["wd cases update <id> --name <name>"],
          });
        }
        const row = await api().cases.update(parsed.data);
        emit(enrichCaseDisplay(row));
      },
    }),
  },
});
