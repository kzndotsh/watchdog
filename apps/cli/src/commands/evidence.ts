import { readFileSync } from "node:fs";

import { defineCommand } from "citty";

import { api, emit, emitList, emitOk, fail, truncText } from "../client";
import { withExamples } from "../examples";
import { resolveEntityId } from "../ids";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  dryRunArg,
  pickDefined,
  requiredCaseArg,
} from "../noun";
import { uploadEvidenceFile } from "../upload-file";

const LIST_COLUMNS = ["id", "kind", "label", "captured"];

function readStdin(): string {
  return readFileSync(0, "utf-8");
}

function listHelp(caseId: string): string[] {
  return [
    `wd evidence paste -c ${caseId} -b "…"`,
    `wd evidence process -c ${caseId} <evidenceId>`,
    `wd evidence enrich -c ${caseId} <evidenceId>`,
  ];
}

export const evidenceCmd = defineNounCommand({
  meta: { name: "evidence", description: "Manage evidence in a case" },
  listArgs: {
    ...caseArg,
    unprocessed: {
      type: "boolean",
      description: "Only unprocessed",
      default: false,
    },
    unattached: {
      type: "boolean",
      description: "Only unattached",
      default: false,
    },
    hidden: {
      type: "boolean",
      description: "Only hidden (soft-deleted)",
      default: false,
    },
  },
  required: ["case"],
  usageHelp: ["wd evidence list -c <caseId>"],
  list: async (args) => {
    const caseId = String(args.case);
    const rows = await api().evidence.list({
      caseId,
      unprocessedOnly: asBoolean(args.unprocessed) ?? false,
      unattachedOnly: asBoolean(args.unattached) ?? false,
      hiddenOnly: asBoolean(args.hidden) ?? false,
    });
    const full = args.full === true;
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        label: truncText(r.label ?? "—", full),
        captured: r.capturedAt.slice(0, 16),
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      help: listHelp(caseId),
    });
  },
  mutations: {
    paste: defineCommand({
      meta: {
        name: "paste",
        description: withExamples(
          "Dump paste text as evidence (accepts --stdin)",
          [
            'wd evidence paste -c <caseId> -b "paste body"',
            'echo "…" | wd evidence paste -c <caseId> --stdin',
          ]
        ),
      },
      args: {
        ...requiredCaseArg,
        body: {
          type: "string",
          alias: "b",
          description: "Paste body text (omit or pass '-' to read stdin)",
        },
        stdin: {
          type: "boolean",
          description: "Read body from stdin",
          default: false,
        },
        label: { type: "string", alias: "l", description: "Label (optional)" },
        url: {
          type: "string",
          alias: "u",
          description: "Source URL (optional)",
        },
        entity: {
          type: "string",
          alias: "e",
          description: "Entity slug or UUID (optional)",
        },
      },
      run: async ({ args }) => {
        let body = args.body === "-" ? undefined : args.body;
        const wantsStdin = args.stdin || args.body === "-";
        if (
          (body === undefined || body === "") &&
          (wantsStdin || !process.stdin.isTTY)
        ) {
          body = readStdin();
        }
        if (body === undefined || body === "") {
          fail("USAGE", "Provide --body or --stdin", {
            help: [
              `wd evidence paste -c ${args.case} -b "text"`,
              `echo "text" | wd evidence paste -c ${args.case} --stdin`,
            ],
          });
        }
        const entityId =
          args.entity !== undefined && args.entity !== ""
            ? await resolveEntityId(args.case, args.entity)
            : undefined;
        const row = await api().evidence.createPaste({
          caseId: args.case,
          body,
          ...pickDefined({ label: args.label, sourceUrl: args.url, entityId }),
        });
        emit(row);
      },
    }),
    url: defineCommand({
      meta: { name: "url", description: "Dump a URL reference as evidence" },
      args: {
        ...requiredCaseArg,
        source: {
          type: "positional",
          description: "URL to dump",
          required: true,
        },
        label: { type: "string", alias: "l", description: "Label (optional)" },
        entity: {
          type: "string",
          alias: "e",
          description: "Entity slug or UUID (optional)",
        },
      },
      run: async ({ args }) => {
        const entityId =
          args.entity !== undefined && args.entity !== ""
            ? await resolveEntityId(args.case, args.entity)
            : undefined;
        const row = await api().evidence.createUrl({
          caseId: args.case,
          sourceUrl: args.source,
          ...pickDefined({ label: args.label, entityId }),
        });
        emit(row);
      },
    }),
    file: defineCommand({
      meta: {
        name: "file",
        description:
          "Upload a local file as evidence (hash → presign → PUT → confirm)",
      },
      args: {
        ...requiredCaseArg,
        path: {
          type: "positional",
          description: "Local file path",
          required: true,
        },
        label: { type: "string", alias: "l", description: "Label (optional)" },
        entity: {
          type: "string",
          alias: "e",
          description: "Entity slug or UUID (optional)",
        },
        mime: {
          type: "string",
          description: "MIME type override (optional)",
        },
      },
      run: async ({ args }) => {
        const entityId =
          args.entity !== undefined && args.entity !== ""
            ? await resolveEntityId(args.case, args.entity)
            : undefined;
        const row = await uploadEvidenceFile({
          caseId: args.case,
          path: args.path,
          ...pickDefined({ label: args.label, entityId, mime: args.mime }),
        });
        emit(row);
      },
    }),
    hide: defineCommand({
      meta: {
        name: "hide",
        description: "Soft-delete evidence (Hidden filter / restore later)",
      },
      args: {
        ...requiredCaseArg,
        evidence: {
          type: "positional",
          description: "Evidence ID",
          required: true,
        },
        ...dryRunArg,
      },
      run: async ({ args }) => {
        if (args["dry-run"]) {
          emitOk({ dryRun: true, hidden: true, id: args.evidence });
          return;
        }
        const row = await api().evidence.softDelete({
          caseId: args.case,
          evidenceId: args.evidence,
        });
        emit({ ...row, hidden: true, id: args.evidence });
      },
    }),
    restore: defineCommand({
      meta: {
        name: "restore",
        description: "Restore soft-deleted evidence to the active queue",
      },
      args: {
        ...requiredCaseArg,
        evidence: {
          type: "positional",
          description: "Evidence ID",
          required: true,
        },
      },
      run: async ({ args }) => {
        const row = await api().evidence.restore({
          caseId: args.case,
          evidenceId: args.evidence,
        });
        emit({ ...row, restored: true, id: args.evidence });
      },
    }),
    download: defineCommand({
      meta: {
        name: "download",
        description: "Print a short-lived download URL for evidence",
      },
      args: {
        ...requiredCaseArg,
        evidence: {
          type: "positional",
          description: "Evidence ID",
          required: true,
        },
        raw: {
          type: "boolean",
          description: "Bare URL on stdout",
          default: false,
        },
      },
      run: async ({ args }) => {
        const row = await api().evidence.downloadUrl({
          caseId: args.case,
          evidenceId: args.evidence,
        });
        if (row.url === null) {
          fail("NOT_DOWNLOADABLE", "No downloadable blob for this evidence", {
            help: [`wd evidence list -c ${args.case}`],
          });
        }
        if (args.raw) {
          console.log(row.url);
          return;
        }
        emitOk({ url: row.url });
      },
    }),
    process: defineCommand({
      meta: {
        name: "process",
        description: withExamples(
          "Start Harvest (or Extract AI with --ai) for evidence",
          [
            "wd evidence process -c <caseId> <evidenceId>",
            "wd evidence process -c <caseId> <evidenceId> --ai",
          ]
        ),
      },
      args: {
        ...requiredCaseArg,
        evidence: {
          type: "positional",
          description: "Evidence ID",
          required: true,
        },
        ai: {
          type: "boolean",
          description: "Extract (AI) instead of Harvest",
          default: false,
        },
      },
      run: async ({ args }) => {
        const row = await api().evidence.process({
          caseId: args.case,
          evidenceId: args.evidence,
          ai: args.ai,
        });
        emit(row);
      },
    }),
    enrich: defineCommand({
      meta: { name: "enrich", description: "Start URL Enrich for evidence" },
      args: {
        ...requiredCaseArg,
        evidence: {
          type: "positional",
          description: "Evidence ID",
          required: true,
        },
      },
      run: async ({ args }) => {
        const row = await api().evidence.enrich({
          caseId: args.case,
          evidenceId: args.evidence,
        });
        emit(row);
      },
    }),
  },
});
