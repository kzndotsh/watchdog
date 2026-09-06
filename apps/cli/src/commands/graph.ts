import { defineCommand } from "citty";

import { api, emit, fail } from "../client";
import { withExamples } from "../examples";
import { parseIdList } from "../ids";
import { loadPatch } from "../load-patch";
import { requiredCaseArg } from "../noun";

export const graphCmd = defineCommand({
  meta: {
    name: "graph",
    description: "Direct Case Graph mutations (escape hatches)",
  },
  run: () => {
    fail("USAGE", "Specify a subcommand: write", {
      help: ["wd graph write -c <caseId> --patch-file <path>"],
    });
  },
  subCommands: {
    write: defineCommand({
      meta: {
        name: "write",
        description: withExamples(
          "Write patch to Graph at unverified (userOverride escape hatch)",
          [
            "wd graph write -c <caseId> --patch-file ./patch.json",
            "cat patch.json | wd graph write -c <caseId> --stdin",
          ]
        ),
      },
      args: {
        ...requiredCaseArg,
        patch: {
          type: "string",
          description: "Patch JSON array string ('-' or omit for stdin)",
        },
        "patch-file": {
          type: "string",
          description: "Path to patch JSON file",
        },
        stdin: {
          type: "boolean",
          description: "Read patch JSON from stdin",
          default: false,
        },
        summary: {
          type: "string",
          description: "Optional summary (stored as attestation text)",
        },
        evidence: {
          type: "string",
          description: "Evidence UUID (comma-separated for multiple)",
        },
        "idempotency-key": {
          type: "string",
          description: "Idempotency key for safe retries",
        },
      },
      run: async ({ args }) => {
        const patch = loadPatch(args);
        const evidenceIds = parseIdList(args.evidence);
        const row = await api().graph.write({
          caseId: args.case,
          patch,
          userOverride: true,
          ...(args.summary !== undefined && args.summary !== ""
            ? { summary: args.summary }
            : {}),
          ...(evidenceIds === undefined ? {} : { evidenceIds }),
          ...(args["idempotency-key"] !== undefined &&
          args["idempotency-key"] !== ""
            ? { idempotencyKey: args["idempotency-key"] }
            : {}),
        });
        emit(row);
      },
    }),
  },
});
