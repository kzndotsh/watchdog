import { defineCommand } from "citty";

import { graphWriteInputSchema, graphWriteList } from "@watchdog/schemas/graph";

import { api, emit, emitList, fail } from "../client";
import { enrichGraphWriteDisplay } from "../display";
import { withExamples } from "../examples";
import { parseIdList, requireCaseId } from "../ids";
import { listFlags, listInputFromFlags } from "../list-flags";
import { loadPatch } from "../load-patch";
import { asBoolean, formatArgs, requiredCaseArg } from "../noun";
import { fetchListPage, pageArgs } from "../paging";

export const graphCmd = defineCommand({
  meta: {
    name: "graph",
    description: "Direct Case Graph mutations (escape hatches)",
  },
  run: () => {
    fail("USAGE", "Specify a subcommand: write, writes", {
      help: [
        "wd graph write -c <caseId> --patch-file <path>",
        "wd graph writes -c <caseId>",
      ],
    });
  },
  subCommands: {
    writes: defineCommand({
      meta: {
        name: "writes",
        description: withExamples(
          "List the Graph write audit rows of a case, newest first",
          [
            "wd graph writes -c <caseId>",
            "wd graph writes -c <caseId> --confidence possible --search import",
          ]
        ),
      },
      args: {
        ...requiredCaseArg,
        ...listFlags(graphWriteList),
        ...pageArgs,
        ...formatArgs,
      },
      run: async ({ args }) => {
        const caseId = requireCaseId(args.case);
        const input = await listInputFromFlags(
          graphWriteList,
          { caseId },
          args
        );
        const page = await fetchListPage(
          async (window) => api().graph.listWrites({ ...input, ...window }),
          args
        );
        emitList({
          items: page.items,
          columns: ["id", "actorLabel", "confidence", "summary", "createdAt"],
          table: asBoolean(args.table),
          nextCursor: page.nextCursor,
          total: page.total,
          help: [`wd graph write -c ${caseId} --patch-file <path>`],
        });
      },
    }),
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
        const caseId = requireCaseId(args.case);
        const patch = loadPatch(args);
        const evidenceIds = parseIdList(args.evidence);
        const row = await api().graph.write(
          graphWriteInputSchema.parse({
            caseId,
            patch,
            userOverride: true,
            summary: args.summary,
            idempotencyKey: args["idempotency-key"],
            evidenceIds,
          })
        );
        emit(enrichGraphWriteDisplay(row, patch));
      },
    }),
  },
});
