import { defineCommand } from "citty";

import {
  createQuestionInputSchema,
  questionList,
  questionScopeInputSchema,
  resolveQuestionInputSchema,
  updateQuestionInputSchema,
} from "@watchdog/schemas/graph";

import { api, emit, emitList, emitOk, fail, truncText } from "../client";
import { requireUserOverride, userOverrideArg } from "../custody";
import { displayStatusLabel, enrichQuestionDisplay } from "../display";
import { requireCaseId, requireUuid, resolveEntityId } from "../ids";
import { listFlags, listInputFromFlags } from "../list-flags";
import { caseListHelp } from "../list-help";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  dryRunArg,
  entityArg,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";
import { fetchListPage, fetchAllItems } from "../paging";
import { parseOptionalNullableTrimmedPatch } from "../parse-cli";
import { expectedVersionArg, resolveExpectedVersion } from "../versions";

const LIST_COLUMNS = [
  "id",
  "version",
  "entityId",
  "text",
  "status",
  "statusLabel",
];

function listHelp(caseId: string): string[] {
  return caseListHelp(caseId, [
    `wd questions create -c ${caseId} --entity <slug> --text "…" --user-override`,
    `wd questions update -c ${caseId} <id> --text "…" --user-override`,
    `wd questions reopen -c ${caseId} <id> --user-override`,
    `wd questions delete -c ${caseId} <id> --user-override`,
  ]);
}

export const questionsCmd = defineNounCommand({
  meta: {
    name: "questions",
    description: "Questions on an entity (writes need --user-override)",
  },
  listArgs: { ...caseArg, ...listFlags(questionList) },
  required: ["case"],
  usageHelp: [
    "wd questions list -c <caseId> [--entity-id <uuid|slug>] [--status open] [--search text] [--sort added.desc]",
  ],
  list: async (args) => {
    const caseId = requireCaseId(args.case);
    const input = await listInputFromFlags(questionList, { caseId }, args);
    const page = await fetchListPage(
      async (window) => api().questions.list({ ...input, ...window }),
      args
    );
    const full = args.full === true;
    emitList({
      items: page.items.map((r) => ({
        id: r.id,
        version: r.version,
        entityId: r.entityId,
        text: truncText(r.text, full),
        status: r.status,
        statusLabel: displayStatusLabel(r.status),
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      nextCursor: page.nextCursor,
      total: page.total,
      help: listHelp(caseId),
    });
  },
  mutations: {
    create: defineCommand({
      meta: {
        name: "create",
        description: "Create a question (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        ...requiredEntityArg,
        text: {
          type: "string",
          description: "Question text",
          required: true,
        },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const caseId = requireCaseId(args.case);
        const entityId = await resolveEntityId(caseId, args.entity);
        const payload = createQuestionInputSchema.parse({
          caseId,
          entityId,
          text: args.text,
        });
        const row = await api().questions.create({
          ...payload,
          userOverride: true,
        });
        emit(enrichQuestionDisplay(row));
      },
    }),
    update: defineCommand({
      meta: {
        name: "update",
        description: "Update a question (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        question: {
          type: "positional",
          description: "Question ID",
          required: true,
        },
        ...entityArg,
        ...expectedVersionArg,
        text: { type: "string", description: "Question text" },
        note: {
          type: "string",
          description:
            "Resolved note (resolved questions only; empty to clear)",
        },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const caseId = requireCaseId(args.case);
        const questionId = requireUuid(args.question, "Question ID");
        const touchesText = args.text !== undefined;
        const touchesNote = args.note !== undefined;
        if (!touchesText && !touchesNote) {
          fail("USAGE", "Provide --text and/or --note", {
            help: [
              `wd questions update -c ${caseId} ${questionId} --text "…" --user-override`,
            ],
          });
        }
        const resolvedNote = parseOptionalNullableTrimmedPatch(args.note);
        const entityRef = args.entity;
        const expectedVersion = await resolveExpectedVersion({
          given: args["expected-version"],
          noun: "Question",
          id: questionId,
          help: [`wd questions list -c ${caseId} --entity <slug>`],
          read:
            entityRef === undefined
              ? null
              : async () => {
                  const entityId = await resolveEntityId(caseId, entityRef);
                  const rows = await fetchAllItems(async (page) =>
                    api().questions.list(
                      questionList.input.parse({ caseId, entityId, ...page })
                    )
                  );
                  return rows.find((row) => row.id === questionId)?.version;
                },
        });
        const parsed = updateQuestionInputSchema.safeParse({
          caseId,
          questionId,
          expectedVersion,
          ...(touchesText ? { text: args.text } : {}),
          ...(resolvedNote === undefined ? {} : { resolvedNote }),
        });
        if (!parsed.success) {
          fail("USAGE", "Provide --text and/or --note", {
            help: [
              `wd questions update -c ${caseId} ${questionId} --text "…" --user-override`,
            ],
          });
        }
        const row = await api().questions.update({
          ...parsed.data,
          userOverride: true,
        });
        emit(enrichQuestionDisplay(row));
      },
    }),
    resolve: defineCommand({
      meta: {
        name: "resolve",
        description: "Resolve a question (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        question: {
          type: "positional",
          description: "Question ID",
          required: true,
        },
        note: {
          type: "string",
          description: "Optional resolved note",
        },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const caseId = requireCaseId(args.case);
        const questionId = requireUuid(args.question, "Question ID");
        const resolvedNote = parseOptionalNullableTrimmedPatch(args.note);
        const row = await api().questions.resolve({
          ...resolveQuestionInputSchema.parse({
            caseId,
            questionId,
            ...(resolvedNote === undefined ? {} : { resolvedNote }),
          }),
          userOverride: true,
        });
        emit(enrichQuestionDisplay(row));
      },
    }),
    reopen: defineCommand({
      meta: {
        name: "reopen",
        description: "Reopen a resolved question (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        question: {
          type: "positional",
          description: "Question ID",
          required: true,
        },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const scope = questionScopeInputSchema.parse({
          caseId: requireCaseId(args.case),
          questionId: requireUuid(args.question, "Question ID"),
        });
        const row = await api().questions.reopen({
          ...scope,
          userOverride: true,
        });
        emit(enrichQuestionDisplay(row));
      },
    }),
    delete: defineCommand({
      meta: {
        name: "delete",
        description: "Delete a question (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        question: {
          type: "positional",
          description: "Question ID",
          required: true,
        },
        ...dryRunArg,
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const scope = questionScopeInputSchema.parse({
          caseId: requireCaseId(args.case),
          questionId: requireUuid(args.question, "Question ID"),
        });
        if (args["dry-run"]) {
          emitOk({ dryRun: true, deleted: true, id: scope.questionId });
          return;
        }
        await api().questions.delete({
          ...scope,
          userOverride: true,
        });
        emitOk({ deleted: true, id: scope.questionId });
      },
    }),
  },
});
