import { describe, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/events/events.functions", () => ({
  createEventFn: serverFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useCreateEvent } from "@/domains/dossier/hooks/use-create-event";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useCreateEvent", () => {
  it("settles the Case the event was added in after the screen moves to another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useCreateEvent(),
      serverFn,
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
