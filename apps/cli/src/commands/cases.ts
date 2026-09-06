import { defineCommand } from "citty";

import { api, emit, emitList, emitOk, fail } from "../client";
import { asBoolean, defineNounCommand, dryRunArg, pickDefined } from "../noun";

const LIST_COLUMNS = ["id", "name", "slug", "allowThirdPartyEgress"];
const LIST_HELP = [
  "wd cases create -n <name>",
  "wd cases get <id>",
  "wd cases delete <id>",
];

export const casesCmd = defineNounCommand({
  meta: { name: "cases", description: "Manage cases" },
  listArgs: {},
  required: [],
  usageHelp: LIST_HELP,
  list: async (args) => {
    const rows = await api().cases.list();
    emitList({
      items: rows,
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
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
        const row = await api().cases.get({ caseId: args.id });
        emit(row);
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
        const row = await api().cases.create({
          name: args.name,
          ...pickDefined({ slug: args.slug, description: args.description }),
        });
        emit(row);
      },
    }),
    update: defineCommand({
      meta: {
        name: "update",
        description:
          "Update case name (regenerates slug), description, or third-party egress",
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
          description: "New description",
        },
        allowThirdPartyEgress: {
          type: "boolean",
          description: "Allow Caps that call third-party APIs",
        },
        denyThirdPartyEgress: {
          type: "boolean",
          description: "Disallow third-party Cap egress",
        },
      },
      run: async ({ args }) => {
        if (
          args.allowThirdPartyEgress === true &&
          args.denyThirdPartyEgress === true
        ) {
          fail(
            "USAGE",
            "Pass only one of --allow-third-party-egress or --deny-third-party-egress",
            { help: ["wd cases update <id> --allow-third-party-egress"] }
          );
        }
        let allowThirdPartyEgress: boolean | undefined;
        if (args.allowThirdPartyEgress === true) {
          allowThirdPartyEgress = true;
        } else if (args.denyThirdPartyEgress === true) {
          allowThirdPartyEgress = false;
        }
        if (
          args.name === undefined &&
          args.description === undefined &&
          allowThirdPartyEgress === undefined
        ) {
          fail(
            "USAGE",
            "Provide at least one of --name, --description, --allow-third-party-egress, or --deny-third-party-egress",
            { help: ["wd cases update <id> --name <name>"] }
          );
        }
        const row = await api().cases.update({
          caseId: args.id,
          ...pickDefined({
            name: args.name,
            description: args.description,
            allowThirdPartyEgress,
          }),
        });
        emit(row);
      },
    }),
    delete: defineCommand({
      meta: {
        name: "delete",
        description: "Delete a case and everything in it",
      },
      args: {
        id: { type: "positional", description: "Case ID", required: true },
        ...dryRunArg,
      },
      run: async ({ args }) => {
        if (args["dry-run"]) {
          emitOk({ dryRun: true, deleted: true, id: args.id });
          return;
        }
        await api().cases.delete({ caseId: args.id });
        emitOk({ deleted: true, id: args.id });
      },
    }),
  },
});
