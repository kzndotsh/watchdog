import { defineCommand } from "citty";

import { api, emit, emitList, truncText } from "../client";
import { requireUserOverride, userOverrideArg } from "../custody";
import { resolveEntityId } from "../ids";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  entityArg,
  pickDefined,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";

const LIST_COLUMNS = ["id", "text", "status"];

function listHelp(caseId: string, entity: string): string[] {
  return [
    `wd questions create -c ${caseId} --entity ${entity} --text "…" --user-override`,
    `wd questions update -c ${caseId} <id> --text "…" --user-override`,
    `wd questions reopen -c ${caseId} <id> --user-override`,
  ];
}

export const questionsCmd = defineNounCommand({
  meta: {
    name: "questions",
    description: "Questions on an entity (writes need --user-override)",
  },
  listArgs: { ...caseArg, ...entityArg },
  required: ["case", "entity"],
  usageHelp: ["wd questions list -c <caseId> --entity <slug>"],
  list: async (args) => {
    const caseId = String(args.case);
    const entity = String(args.entity);
    const entityId = await resolveEntityId(caseId, entity);
    const rows = await api().questions.list({ caseId, entityId });
    const full = args.full === true;
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        text: truncText(r.text, full),
        status: r.status,
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      help: listHelp(caseId, entity),
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
        const entityId = await resolveEntityId(args.case, args.entity);
        const row = await api().questions.create({
          caseId: args.case,
          entityId,
          text: args.text,
          userOverride: true,
        });
        emit(row);
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
        let resolvedNote: string | null | undefined;
        if (args.note === undefined) {
          resolvedNote = undefined;
        } else {
          const trimmed = args.note.trim();
          resolvedNote = trimmed === "" ? null : trimmed;
        }
        const row = await api().questions.update({
          caseId: args.case,
          questionId: args.question,
          userOverride: true,
          ...pickDefined({ text: args.text }),
          ...(resolvedNote === undefined ? {} : { resolvedNote }),
        });
        emit(row);
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
        const row = await api().questions.resolve({
          caseId: args.case,
          questionId: args.question,
          userOverride: true,
          ...pickDefined({ resolvedNote: args.note }),
        });
        emit(row);
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
        const row = await api().questions.reopen({
          caseId: args.case,
          questionId: args.question,
          userOverride: true,
        });
        emit(row);
      },
    }),
  },
});
