import { readFileSync } from "node:fs";

import { defineCommand } from "citty";

import {
  credentialNameSchema,
  deleteCredentialInputSchema,
  putCredentialInputSchema,
} from "@watchdog/schemas";

import { api, emit, emitList, emitOk, fail } from "../client";
import { withExamples } from "../examples";
import { asBoolean, defineNounCommand, dryRunArg, hasCliText } from "../noun";

const LIST_COLUMNS = ["name", "configured", "updated", "label"];
const LIST_HELP = [
  "wd credentials put --name <NAME> --stdin",
  "wd credentials delete --name <NAME>",
];

function readSecret(args: { stdin?: boolean; "secret-env"?: string }): string {
  if (args.stdin === true && hasCliText(args["secret-env"])) {
    fail("USAGE", "Use only one of --stdin or --secret-env", {
      help: ["wd credentials put --name <NAME> --stdin"],
    });
  }
  if (args.stdin === true) {
    return readFileSync(0, "utf-8").trim();
  }
  const envName = args["secret-env"];
  if (hasCliText(envName)) {
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

function parseCredentialName(value: string, help: string[]): string {
  const parsed = credentialNameSchema.safeParse(value);
  if (!parsed.success) {
    fail("USAGE", "Credential name must be SCREAMING_SNAKE (A-Z, 0-9, _)", {
      help,
    });
  }
  return parsed.data;
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
        if (!hasCliText(args.name)) {
          fail("USAGE", "Credential name must not be blank", {
            help: ["wd credentials put --name WHOIS_API_KEY --stdin"],
          });
        }
        const name = parseCredentialName(args.name, [
          "wd credentials put --name WHOIS_API_KEY --stdin",
        ]);
        const secret = readSecret(args);
        const row = await api().credentials.put(
          putCredentialInputSchema.parse({
            name,
            secret,
            label: args.label,
          })
        );
        emit({
          name: row.name,
          configured: row.configured,
          updatedAt: row.updatedAt,
          label: row.label,
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
        if (!hasCliText(args.name)) {
          fail("USAGE", "Credential name must not be blank", {
            help: ["wd credentials delete --name WHOIS_API_KEY"],
          });
        }
        const name = parseCredentialName(args.name, [
          "wd credentials delete --name WHOIS_API_KEY",
        ]);
        if (args["dry-run"]) {
          emitOk({ dryRun: true, deleted: true, name });
          return;
        }
        await api().credentials.delete(
          deleteCredentialInputSchema.parse({ name })
        );
        emitOk({ deleted: true, name });
      },
    }),
  },
});
