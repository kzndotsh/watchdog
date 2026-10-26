import { defineCommand } from "citty";

import {
  createEventInputSchema,
  getEventsInputSchema,
  eventList,
  eventScopeInputSchema,
  updateEventInputSchema,
} from "@watchdog/schemas/graph";

import { api, emit, emitList, emitOk, fail, truncText } from "../client";
import { requireUserOverride, userOverrideArg } from "../custody";
import { enrichEventDisplay } from "../display";
import { requireCaseId, requireUuid, resolveEntityId } from "../ids";
import { listFlags, listInputFromFlags } from "../list-flags";
import { caseListHelp } from "../list-help";
import {
  asBoolean,
  caseArg,
  defineNounCommand,
  dryRunArg,
  pickDefined,
  requiredCaseArg,
  requiredEntityArg,
} from "../noun";
import { fetchListPage } from "../paging";
import { parseOptionalNullableTrimmedPatch } from "../parse-cli";
import { expectedVersionArg, resolveExpectedVersion } from "../versions";

const LIST_COLUMNS = ["id", "version", "entityId", "when", "what", "where"];

function listHelp(caseId: string): string[] {
  return caseListHelp(caseId, [
    `wd events create -c ${caseId} --entity <slug> --when <when> --what "…" --user-override`,
  ]);
}

export const eventsCmd = defineNounCommand({
  meta: {
    name: "events",
    description: "Timeline events on an entity (writes need --user-override)",
  },
  listArgs: { ...caseArg, ...listFlags(eventList) },
  required: ["case"],
  usageHelp: [
    "wd events list -c <caseId> [--entity-id <uuid|slug>] [--search text] [--sort when.desc]",
  ],
  list: async (args) => {
    const caseId = requireCaseId(args.case);
    const input = await listInputFromFlags(eventList, { caseId }, args);
    const page = await fetchListPage(
      async (window) => api().events.list({ ...input, ...window }),
      args
    );
    const full = args.full === true;
    emitList({
      items: page.items.map((r) => ({
        id: r.id,
        version: r.version,
        entityId: r.entityId,
        when: r.when,
        what: truncText(r.what, full),
        where: r.where ?? "—",
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
        const caseId = requireCaseId(args.case);
        const entityId = await resolveEntityId(caseId, args.entity);
        const payload = createEventInputSchema.parse({
          caseId,
          entityId,
          when: args.when,
          what: args.what,
          ...pickDefined({ where: args.where }),
        });
        const row = await api().events.create({
          ...payload,
          userOverride: true,
        });
        emit(enrichEventDisplay(row));
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
        ...expectedVersionArg,
        when: { type: "string", description: "When (freeform / ISO)" },
        what: { type: "string", description: "What happened" },
        where: {
          type: "string",
          description: "Optional where (empty to clear)",
        },
        ...userOverrideArg,
      },
      run: async ({ args }) => {
        requireUserOverride(args["user-override"]);
        const caseId = requireCaseId(args.case);
        const eventId = requireUuid(args.event, "Event ID");
        const touchesWhen = args.when !== undefined;
        const touchesWhat = args.what !== undefined;
        const touchesWhere = args.where !== undefined;
        if (!touchesWhen && !touchesWhat && !touchesWhere) {
          fail("USAGE", "Provide at least one of --when, --what, or --where", {
            help: [
              `wd events update -c ${caseId} ${eventId} --when "…" --user-override`,
            ],
          });
        }
        const where = parseOptionalNullableTrimmedPatch(args.where);
        const expectedVersion = await resolveExpectedVersion({
          given: args["expected-version"],
          noun: "Event",
          id: eventId,
          help: [`wd events list -c ${caseId} --entity-id <slug>`],
          read: async () => {
            const rows = await api().events.getMany(
              getEventsInputSchema.parse({ caseId, ids: [eventId] })
            );
            return rows.find((row) => row.id === eventId)?.version;
          },
        });
        const parsed = updateEventInputSchema.safeParse({
          caseId,
          eventId,
          expectedVersion,
          ...(touchesWhen ? { when: args.when } : {}),
          ...(touchesWhat ? { what: args.what } : {}),
          ...(where === undefined ? {} : { where }),
        });
        if (!parsed.success) {
          fail("USAGE", "Provide at least one of --when, --what, or --where", {
            help: [
              `wd events update -c ${caseId} ${eventId} --when "…" --user-override`,
            ],
          });
        }
        const row = await api().events.update({
          ...parsed.data,
          userOverride: true,
        });
        emit(enrichEventDisplay(row));
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
        const scope = eventScopeInputSchema.parse({
          caseId: requireCaseId(args.case),
          eventId: requireUuid(args.event, "Event ID"),
        });
        if (args["dry-run"]) {
          emitOk({ dryRun: true, deleted: true, id: scope.eventId });
          return;
        }
        await api().events.delete({
          ...scope,
          userOverride: true,
        });
        emitOk({ deleted: true, id: scope.eventId });
      },
    }),
  },
});
