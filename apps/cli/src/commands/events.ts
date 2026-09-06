import { defineCommand } from "citty";

import { api, emit, emitList, emitOk, fail, truncText } from "../client";
import { requireUserOverride, userOverrideArg } from "../custody";
import { resolveEntityId } from "../ids";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  dryRunArg,
  entityArg,
  pickDefined,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";

const LIST_COLUMNS = ["id", "when", "what", "where"];

function listHelp(caseId: string, entity: string): string[] {
  return [
    `wd events create -c ${caseId} --entity ${entity} --when <when> --what "…" --user-override`,
  ];
}

export const eventsCmd = defineNounCommand({
  meta: {
    name: "events",
    description: "Timeline events on an entity (writes need --user-override)",
  },
  listArgs: { ...caseArg, ...entityArg },
  required: ["case", "entity"],
  usageHelp: ["wd events list -c <caseId> --entity <slug>"],
  list: async (args) => {
    const caseId = String(args.case);
    const entity = String(args.entity);
    const entityId = await resolveEntityId(caseId, entity);
    const rows = await api().events.list({ caseId, entityId });
    const full = args.full === true;
    emitList({
      items: rows.map((r) => ({
        id: r.id,
        when: r.when,
        what: truncText(r.what, full),
        where: r.where ?? "—",
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
        description: "Create a timeline event (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        ...requiredEntityArg,
        when: {
          type: "string",
          description: "When (freeform / ISO)",
          required: true,
        },
        what: {
          type: "string",
          description: "What happened",
          required: true,
        },
        where: { type: "string", description: "Optional where" },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const entityId = await resolveEntityId(args.case, args.entity);
        const row = await api().events.create({
          caseId: args.case,
          entityId,
          when: args.when,
          what: args.what,
          userOverride: true,
          ...pickDefined({ where: args.where }),
        });
        emit(row);
      },
    }),
    update: defineCommand({
      meta: {
        name: "update",
        description:
          "Update a timeline event (partial patch; --user-override required)",
      },
      args: {
        ...requiredCaseArg,
        event: {
          type: "positional",
          description: "Event ID",
          required: true,
        },
        when: { type: "string", description: "When (freeform / ISO)" },
        what: { type: "string", description: "What happened" },
        where: { type: "string", description: "Optional where" },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        if (
          args.when === undefined &&
          args.what === undefined &&
          args.where === undefined
        ) {
          fail("USAGE", "Provide at least one of --when, --what, or --where", {
            help: [
              `wd events update -c ${args.case} ${args.event} --when "…" --user-override`,
            ],
          });
        }
        const row = await api().events.update({
          caseId: args.case,
          eventId: args.event,
          userOverride: true,
          ...pickDefined({
            when: args.when,
            what: args.what,
            where: args.where,
          }),
        });
        emit(row);
      },
    }),
    delete: defineCommand({
      meta: {
        name: "delete",
        description: "Delete a timeline event (--user-override required)",
      },
      args: {
        ...requiredCaseArg,
        event: {
          type: "positional",
          description: "Event ID",
          required: true,
        },
        ...dryRunArg,
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        if (args["dry-run"]) {
          emitOk({ dryRun: true, deleted: true, id: args.event });
          return;
        }
        await api().events.delete({
          caseId: args.case,
          eventId: args.event,
          userOverride: true,
        });
        emitOk({ deleted: true, id: args.event });
      },
    }),
  },
});
