import { describe, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());
const onError = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/events/events.functions", () => ({
  deleteEventFn: serverFn,
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useDeleteEvent } from "@/domains/dossier/hooks/use-delete-event";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectReportsFailure,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useDeleteEvent", () => {
  it("settles the Case the event was deleted in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useDeleteEvent({ onError }),
      serverFn,
      variables: {
        ...SCOPE_A,
        eventId: testId(33),
      },
    });
  });

  it("reports a rejected write and settles nothing", async () => {
    await expectReportsFailure({
      useVerb: () => useDeleteEvent({ onError }),
      serverFn,
      variables: {
        ...SCOPE_A,
        eventId: testId(33),
      },
      onError,
    });
  });

  it("reports a server failure as Couldn't delete event, then Try again", async () => {
    await expectReportsFailure({
      useVerb: () => useDeleteEvent({ onError }),
      serverFn,
      variables: {
        ...SCOPE_A,
        eventId: testId(33),
      },
      onError,
      rejectWith: { code: "INTERNAL_SERVER_ERROR", status: 500 },
      message: "Couldn't delete event. Try again.",
    });
  });
});
