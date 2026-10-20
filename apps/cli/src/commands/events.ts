import { defineCommand } from "citty";

import {
  createEventInputSchema,
  listEntityChildrenInputSchema,
  eventScopeInputSchema,
  updateEventInputSchema,
} from "@watchdog/schemas/graph";

import { api, emit, emitList, emitOk, fail, truncText } from "../client";
import { requireUserOverride, userOverrideArg } from "../custody";
import { enrichEventDisplay } from "../display";
import { requireCaseId, requireUuid, resolveEntityId } from "../ids";
import { entityListHelp } from "../list-help";
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
import { fetchListPage, fetchAllItems } from "../paging";
import { parseOptionalNullableTrimmedPatch } from "../parse-cli";
import { expectedVersionArg, resolveExpectedVersion } from "../versions";

const LIST_COLUMNS = ["id", "version", "when", "what", "where"];

function listHelp(caseId: string, entity: string): string[] {
  return entityListHelp(caseId, entity, [
    `wd events create -c ${caseId} --entity ${entity} --when <when> --what "…" --user-override`,
  ]);
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
    const caseId = requireCaseId(args.case);
    const entity = String(args.entity);
    const entityId = await resolveEntityId(caseId, entity);
    const page = await fetchListPage(
      async (params) =>
        api().events.list(
          listEntityChildrenInputSchema.parse({ caseId, entityId, ...params })
        ),
      args
    );
    const full = args.full === true;
    emitList({
      items: page.items.map((r) => ({
        id: r.id,
        version: r.version,
        when: r.when,
        what: truncText(r.what, full),
        where: r.where ?? "—",
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      nextCursor: page.nextCursor,
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
        ...entityArg,
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
        const entityRef = args.entity;
        const expectedVersion = await resolveExpectedVersion({
          given: args["expected-version"],
          noun: "Event",
          id: eventId,
          help: [`wd events list -c ${caseId} --entity <slug>`],
          read:
            entityRef === undefined
              ? null
              : async () => {
                  const entityId = await resolveEntityId(caseId, entityRef);
                  const rows = await fetchAllItems(async (page) =>
                    api().events.list(
                      listEntityChildrenInputSchema.parse({
                        caseId,
                        entityId,
                        ...page,
                      })
                    )
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
