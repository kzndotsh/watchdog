import type { z } from "zod";

import type { EventRecord as CoreEventRecord } from "@watchdog/core/graph";
import type {
  createEventInputSchema,
  eventScopeInputSchema,
  updateEventInputSchema,
} from "@watchdog/schemas/graph";

export type EventRecord = CoreEventRecord;

export type CreateEventInput = z.output<typeof createEventInputSchema>;

export type EventScopeInput = z.output<typeof eventScopeInputSchema>;

export type UpdateEventInput = z.output<typeof updateEventInputSchema>;
