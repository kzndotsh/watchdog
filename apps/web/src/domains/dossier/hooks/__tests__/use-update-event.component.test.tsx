import { describe, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/events/events.functions", () => ({
  updateEventFn: serverFn,
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useUpdateEvent } from "@/domains/dossier/hooks/use-update-event";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useUpdateEvent", () => {
  it("settles the Case the event was edited in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useUpdateEvent({ onUpdated: onDone }),
      serverFn,
      expectCallbackBeforeInvalidation: true,
      variables: {
        ...SCOPE_A,
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
