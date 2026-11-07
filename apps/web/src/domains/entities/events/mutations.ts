import {
  createEventFn,
  deleteEventFn,
  updateEventFn,
} from "@/domains/entities/events/events.functions";
import type { TimelineEventValues } from "@/domains/entities/events/types";
import { defineGraphChildMutation } from "@/domains/entities/hooks/use-graph-child-mutation";
import type { EntityScope } from "@/domains/entities/types";
import {
  createEventInputSchema,
  eventScopeInputSchema,
  updateEventInputSchema,
} from "@watchdog/schemas/graph";

export type CreateEventVariables = EntityScope & { value: TimelineEventValues };

/** Add a timeline Event to an Entity. */
export const useCreateEvent = defineGraphChildMutation({
  fn: createEventFn,
  parse: ({ caseId, entityId, value }: CreateEventVariables) =>
    createEventInputSchema.parse({
      caseId,
      entityId,
      when: value.when,
      what: value.what,
      where: value.where,
    }),
  success: "Event added",
  verb: "add",
  noun: "event",
});

export type UpdateEventVariables = EntityScope & {
  eventId: string;
  /** The Event's `version` when the editor opened; the save fails as stale if it moved on. */
  expectedVersion: number;
  value: TimelineEventValues;
};

/** Edit a timeline Event. */
export const useUpdateEvent = defineGraphChildMutation({
  fn: updateEventFn,
  parse: ({ caseId, eventId, expectedVersion, value }: UpdateEventVariables) =>
    updateEventInputSchema.parse({
      caseId,
      eventId,
      expectedVersion,
      when: value.when,
      what: value.what,
      where: value.where,
    }),
  success: "Event updated",
  verb: "update",
  noun: "event",
});

export type DeleteEventVariables = EntityScope & { eventId: string };

/** Delete a timeline Event. */
export const useDeleteEvent = defineGraphChildMutation({
  fn: deleteEventFn,
  parse: ({ caseId, eventId }: DeleteEventVariables) =>
    eventScopeInputSchema.parse({ caseId, eventId }),
  success: "Event deleted",
  verb: "delete",
  noun: "event",
});
