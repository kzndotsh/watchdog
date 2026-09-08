import type { z } from "zod";

import type { EventRecord as CoreEventRecord } from "@watchdog/core";
import {
  createEventInputSchema,
  eventScopeInputSchema,
  updateEventInputSchema,
} from "@watchdog/schemas";

export type EventRecord = CoreEventRecord;

export {
  entityScopeInputSchema,
  type EntityScopeInput,
} from "@watchdog/schemas";

export { createEventInputSchema };
export type CreateEventInput = z.output<typeof createEventInputSchema>;

export { eventScopeInputSchema };
export type EventScopeInput = z.output<typeof eventScopeInputSchema>;

export { updateEventInputSchema };
export type UpdateEventInput = z.output<typeof updateEventInputSchema>;
