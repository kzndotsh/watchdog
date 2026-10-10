import { describe, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/events/events.functions", () => ({
  updateEventFn: serverFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useUpdateEvent } from "@/domains/dossier/hooks/use-update-event";
import { testId } from "@watchdog/test-kit";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useUpdateEvent", () => {
  it("settles the Case the event was edited in after the screen moves to another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useUpdateEvent(),
      serverFn,
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
