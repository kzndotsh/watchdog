import { readFileSync } from "node:fs";

import { defineCommand } from "citty";

import { api, emit, emitList, emitOk, fail } from "../client";
import { withExamples } from "../examples";
import { asBoolean, defineNounCommand, dryRunArg, pickDefined } from "../noun";

const LIST_COLUMNS = ["name", "configured", "updated", "label"];
const LIST_HELP = [
  "wd credentials put --name <NAME> --stdin",
  "wd credentials delete --name <NAME>",
];

function readSecret(args: { stdin?: boolean; "secret-env"?: string }): string {
  if (args.stdin === true) {
    return readFileSync(0, "utf-8").trim();
  }
  const envName = args["secret-env"];
  if (envName !== undefined && envName !== "") {
    const value = process.env[envName];
    if (value === undefined || value.trim() === "") {
      return fail("USAGE", `env ${envName} is empty or unset`, {
        help: ["wd credentials put --name <NAME> --secret-env <VAR>"],
      });
    }
    return value.trim();
  }
  return fail(
    "USAGE",
    "Provide secret via --stdin (preferred) or --secret-env VAR",
    { help: ["wd credentials put --name <NAME> --stdin"] }
  );
}

export const credentialsCmd = defineNounCommand({
  meta: {
    name: "credentials",
    description: "Manage vault credential slots (never prints secrets)",
  },
  listArgs: {},
  required: [],
  usageHelp: LIST_HELP,
  list: async (args) => {
    const rows = await api().credentials.list();
    emitList({
      items: rows.map((r) => ({
        name: r.name,
        configured: r.configured,
        updated: r.updatedAt ?? "",
        label: r.label,
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      help: LIST_HELP,
    });
  },
  mutations: {
    put: defineCommand({
      meta: {
        name: "put",
        description: withExamples(
          "Create or replace a credential (--stdin or --secret-env)",
          [
            'echo "$KEY" | wd credentials put --name WHOIS_API_KEY --stdin',
            "wd credentials put --name WHOIS_API_KEY --secret-env WHOIS_API_KEY",
          ]
        ),
      },
      args: {
        name: {
          type: "string",
          description: "SCREAMING_SNAKE credential name",
          required: true,
        },
        stdin: {
          type: "boolean",
          description: "Read secret from stdin (preferred)",
          default: false,
        },
        "secret-env": {
          type: "string",
          description: "Env var holding the secret (optional)",
        },
        label: {
          type: "string",
          description: "Optional display label",
        },
      },
      run: async ({ args }) => {
        const secret = readSecret(args);
        const row = await api().credentials.put({
          name: args.name,
          secret,
          ...pickDefined({ label: args.label }),
        });
        emit({
          name: row.name,
          configured: row.configured,
          updatedAt: row.updatedAt,
        });
      },
    }),
    delete: defineCommand({
      meta: { name: "delete", description: "Delete a credential by name" },
      args: {
        name: {
          type: "string",
          description: "SCREAMING_SNAKE credential name",
          required: true,
        },
        ...dryRunArg,
      },
      run: async ({ args }) => {
        if (args["dry-run"]) {
          emitOk({ dryRun: true, deleted: true, name: args.name });
          return;
        }
        await api().credentials.delete({ name: args.name });
        emitOk({ deleted: true, name: args.name });
      },
    }),
  },
});
