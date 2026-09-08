import { defineCommand } from "citty";

import {
  createCaseFieldsSchema,
  deleteCaseInputSchema,
  updateCaseInputSchema,
} from "@watchdog/schemas";

import { api, emit, emitList, emitOk, fail } from "../client";
import { enrichCaseDisplay } from "../display";
import { requireUuid } from "../ids";
import { asBoolean, defineNounCommand, dryRunArg, pickDefined } from "../noun";

const LIST_COLUMNS = [
  "id",
  "name",
  "slug",
  "allowThirdPartyEgress",
  "egressLabel",
];
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
      items: rows.map((r) => enrichCaseDisplay(r)),
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
        const fields = createCaseFieldsSchema.parse({
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
          description: "New description (empty to clear)",
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
        const caseId = requireUuid(args.id, "Case ID");
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
          ...(allowThirdPartyEgress === undefined
            ? {}
            : { allowThirdPartyEgress }),
        });
        if (!parsed.success) {
          fail(
            "USAGE",
            "Provide at least one of --name, --description, --allow-third-party-egress, or --deny-third-party-egress",
            { help: ["wd cases update <id> --name <name>"] }
          );
        }
        const row = await api().cases.update(parsed.data);
        emit(enrichCaseDisplay(row));
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
        const scope = deleteCaseInputSchema.parse({
          caseId: requireUuid(args.id, "Case ID"),
        });
        if (args["dry-run"]) {
          emitOk({ dryRun: true, deleted: true, id: scope.caseId });
          return;
        }
        await api().cases.delete(scope);
        emitOk({ deleted: true, id: scope.caseId });
      },
    }),
  },
});
