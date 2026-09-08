import { defineCommand } from "citty";

import {
  dumpPasteInputSchema,
  dumpUrlInputSchema,
  evidenceScopeInputSchema,
  listEvidenceInputSchema,
  nonEmptyTrimmed,
  processEvidenceInputSchema,
} from "@watchdog/schemas";

import { api, emit, emitList, emitOk, fail, truncText } from "../client";
import {
  evidenceKindLabel,
  enrichEvidenceDisplay,
  enrichJobDisplay,
} from "../display";
import { withExamples } from "../examples";
import { requireCaseId, requireUuid, resolveEntityId } from "../ids";
import { jobInputTitlesForJobs } from "../job-evidence-titles";
import { caseListHelp } from "../list-help";
import { readStdin } from "../load-patch";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  dryRunArg,
  hasCliText,
  pickDefined,
  requiredCaseArg,
} from "../noun";
import { uploadEvidenceFile } from "../upload-file";

const LIST_COLUMNS = ["id", "kind", "kindLabel", "label", "captured"];

function listHelp(caseId: string): string[] {
  return caseListHelp(caseId, [
    `wd evidence paste -c ${caseId} -b "…"`,
    `wd evidence file -c ${caseId} <path>`,
    `wd evidence process -c ${caseId} <evidenceId>`,
    `wd evidence enrich -c ${caseId} <evidenceId>`,
  ]);
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
    const caseId = requireCaseId(args.case);
    const parsed = listEvidenceInputSchema.safeParse({
      caseId,
      unprocessedOnly: asBoolean(args.unprocessed) ?? false,
      unattachedOnly: asBoolean(args.unattached) ?? false,
      hiddenOnly: asBoolean(args.hidden) ?? false,
    });
    if (!parsed.success) {
      fail(
        "USAGE",
        parsed.error.issues[0]?.message ??
          "hidden is mutually exclusive with unprocessed and unattached",
        { help: listHelp(caseId) }
      );
    }
    const rows = await api().evidence.list(parsed.data);
    const full = args.full === true;
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        kindLabel: evidenceKindLabel(r.kind),
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
        const caseId = requireCaseId(args.case);
        let body = args.body === "-" ? undefined : args.body;
        const wantsStdin = args.stdin || args.body === "-";
        if (
          (body === undefined || body === "") &&
          (wantsStdin || !process.stdin.isTTY)
        ) {
          body = readStdin();
        }
        if (body === undefined || !hasCliText(body)) {
          fail("USAGE", "Provide --body or --stdin (body must not be blank)", {
            help: [
              `wd evidence paste -c ${caseId} -b "text"`,
              `echo "text" | wd evidence paste -c ${caseId} --stdin`,
            ],
          });
        }
        const entityId = hasCliText(args.entity)
          ? await resolveEntityId(caseId, args.entity)
          : undefined;
        const fields = dumpPasteInputSchema.parse({
          caseId,
          body,
          ...pickDefined({
            label: args.label,
            sourceUrl: args.url,
            entityId,
          }),
        });
        const row = await api().evidence.createPaste(fields);
        emit(enrichEvidenceDisplay(row));
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
        const caseId = requireCaseId(args.case);
        const entityId = hasCliText(args.entity)
          ? await resolveEntityId(caseId, args.entity)
          : undefined;
        const fieldsParsed = dumpUrlInputSchema.safeParse({
          caseId,
          sourceUrl: args.source,
          ...pickDefined({ label: args.label, entityId }),
        });
        if (!fieldsParsed.success) {
          fail("USAGE", "URL must be http or https", {
            help: [`wd evidence url -c ${caseId} https://example.com`],
          });
        }
        const row = await api().evidence.createUrl(fieldsParsed.data);
        emit(enrichEvidenceDisplay(row));
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
        const caseId = requireCaseId(args.case);
        const filePath = nonEmptyTrimmed.parse(args.path);
        const entityId = hasCliText(args.entity)
          ? await resolveEntityId(caseId, args.entity)
          : undefined;
        const row = await uploadEvidenceFile({
          caseId,
          path: filePath,
          ...pickDefined({ label: args.label, entityId, mime: args.mime }),
        });
        emit(enrichEvidenceDisplay(row));
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
        const caseId = requireCaseId(args.case);
        const evidenceId = requireUuid(args.evidence, "Evidence ID");
        const scope = evidenceScopeInputSchema.parse({ caseId, evidenceId });
        if (args["dry-run"]) {
          emitOk({ dryRun: true, hidden: true, id: scope.evidenceId });
          return;
        }
        await api().evidence.softDelete(scope);
        emitOk({ hidden: true, id: scope.evidenceId });
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
        const caseId = requireCaseId(args.case);
        const evidenceId = requireUuid(args.evidence, "Evidence ID");
        const scope = evidenceScopeInputSchema.parse({ caseId, evidenceId });
        await api().evidence.restore(scope);
        emitOk({ restored: true, id: scope.evidenceId });
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
        const caseId = requireCaseId(args.case);
        const evidenceId = requireUuid(args.evidence, "Evidence ID");
        const scope = evidenceScopeInputSchema.parse({ caseId, evidenceId });
        const row = await api().evidence.downloadUrl(scope);
        if (row.url === null) {
          fail("NOT_DOWNLOADABLE", "No downloadable blob for this evidence", {
            help: [`wd evidence list -c ${caseId}`],
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
        const caseId = requireCaseId(args.case);
        const evidenceId = requireUuid(args.evidence, "Evidence ID");
        const row = await api().evidence.process(
          processEvidenceInputSchema.parse({
            caseId,
            evidenceId,
            ai: args.ai,
          })
        );
        const { evidenceTitles, entityTitles } = await jobInputTitlesForJobs(
          caseId,
          [row]
        );
        emit(enrichJobDisplay(row, evidenceTitles, entityTitles));
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
        const caseId = requireCaseId(args.case);
        const evidenceId = requireUuid(args.evidence, "Evidence ID");
        const scope = evidenceScopeInputSchema.parse({ caseId, evidenceId });
        const row = await api().evidence.enrich(scope);
        const { evidenceTitles, entityTitles } = await jobInputTitlesForJobs(
          caseId,
          [row]
        );
        emit(enrichJobDisplay(row, evidenceTitles, entityTitles));
      },
    }),
  },
});
