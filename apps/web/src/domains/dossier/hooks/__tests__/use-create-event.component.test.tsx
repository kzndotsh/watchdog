import { describe, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/events/events.functions", () => ({
  createEventFn: serverFn,
}));
vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { useCreateEvent } from "@/domains/dossier/hooks/use-create-event";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useCreateEvent", () => {
  it("settles the Case the event was added in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useCreateEvent({ onCreated: onDone }),
      serverFn,
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
});
