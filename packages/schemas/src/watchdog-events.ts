import { z } from "zod";

import { trimmedUuidSchema } from "./primitives";

const watchdogEventSchemas = [
  z.object({
    type: z.literal("job_update"),
    caseId: trimmedUuidSchema,
    jobId: trimmedUuidSchema,
    status: z.string(),
  }),
  z.object({
    type: z.literal("proposal_created"),
    caseId: trimmedUuidSchema,
    proposalId: trimmedUuidSchema,
  }),
  z.object({
    type: z.literal("proposal_queue_changed"),
    caseId: trimmedUuidSchema,
  }),
  z.object({
    type: z.literal("entity_changed"),
    caseId: trimmedUuidSchema,
  }),
  z.object({
    type: z.literal("evidence_changed"),
    caseId: trimmedUuidSchema,
    evidenceId: trimmedUuidSchema.optional(),
  }),
  z.object({
    type: z.literal("task_changed"),
    caseId: trimmedUuidSchema,
    entityId: trimmedUuidSchema.optional(),
  }),
] as const;

/** SSE / LISTEN-NOTIFY payload shapes. Shared by server emitters and the browser live-events hook. */
export const watchdogEventSchema = z.discriminatedUnion("type", [
  watchdogEventSchemas[0],
  watchdogEventSchemas[1],
  watchdogEventSchemas[2],
  watchdogEventSchemas[3],
  watchdogEventSchemas[4],
  watchdogEventSchemas[5],
]);

export type WatchdogEvent = z.infer<typeof watchdogEventSchema>;

export const WATCHDOG_EVENT_TYPES = watchdogEventSchemas.map(
  (schema) => schema.shape.type.value
);

/** Runtime guard for payloads read off the `watchdog_events` channel / SSE. */
export function isWatchdogEvent(value: unknown): value is WatchdogEvent {
  return watchdogEventSchema.safeParse(value).success;
}

/** Inbox queue invalidation — new proposal or accept/reject from another client. */
export function isProposalQueueLiveEvent(event: WatchdogEvent): boolean {
  return (
    event.type === "proposal_created" || event.type === "proposal_queue_changed"
  );
}
