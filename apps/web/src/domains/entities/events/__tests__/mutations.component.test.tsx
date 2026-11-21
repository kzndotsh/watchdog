import { describe, it, vi } from "vitest";

const onError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import {
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
} from "@/domains/entities/events/mutations";
import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "@/domains/entities/hooks/__tests__/helpers/entity-write-harness";
import { procedureDouble } from "@/testing/orpc-client";
import { testId } from "@watchdog/domain/test-kit";

const procedures = {
  createEventFn: procedureDouble("events.create"),
  deleteEventFn: procedureDouble("events.delete"),
  updateEventFn: procedureDouble("events.update"),
};

describe("events Graph child mutations", () => {
  it("settles the Case the event was added in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useCreateEvent({ onSuccess: onDone }),
      procedure: procedures.createEventFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        value: {
          when: "2024-05-01",
          what: "Registered",
          where: "Berlin",
        },
      },
    });
  });

  it("settles the Case the event was deleted in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useDeleteEvent({ onError }),
      procedure: procedures.deleteEventFn,
      variables: {
        ...SCOPE_A,
        eventId: testId(33),
      },
    });
  });

  it("settles the Case the event was edited in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useUpdateEvent({ onSuccess: onDone }),
      procedure: procedures.updateEventFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
        expectedVersion: 1,
        eventId: testId(33),
        value: {
          when: "2024-05-01",
          what: "Registered",
          where: "Berlin",
        },
      },
    });
  });
});
