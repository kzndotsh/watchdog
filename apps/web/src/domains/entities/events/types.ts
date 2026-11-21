import type { z } from "zod";

import type {
  createEventInputSchema,
  eventScopeInputSchema,
  updateEventInputSchema,
} from "@watchdog/domain/schemas/graph";
import type { EventRecord as CoreEventRecord } from "@watchdog/server/core/graph";

export type EventRecord = CoreEventRecord;

export type CreateEventInput = z.output<typeof createEventInputSchema>;

export type EventScopeInput = z.output<typeof eventScopeInputSchema>;

export type UpdateEventInput = z.output<typeof updateEventInputSchema>;

/** What the timeline Event form collects. */
export type TimelineEventValues = {
  when: string;
  what: string;
  where: string;
};
