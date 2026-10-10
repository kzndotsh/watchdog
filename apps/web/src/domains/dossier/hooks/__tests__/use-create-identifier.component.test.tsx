import { describe, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({ auth: {} }));

const serverFn = vi.hoisted(() => vi.fn());

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  createIdentifierFn: serverFn,
}));
vi.mock("@/shared/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useCreateIdentifier } from "@/domains/dossier/hooks/use-create-identifier";

import {
  SCOPE_A,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

describe("useCreateIdentifier", () => {
  it("settles the Case the identifier was added in (from the variables) when the screen re-renders for another Case", async () => {
    await expectSettlesStartingCase({
      useVerb: () => useCreateIdentifier(),
      serverFn,
      variables: {
        ...SCOPE_A,
        value: {
          type: "email",
          value: "a@example.com",
          platform: "",
          status: "current",
          confidence: "unverified",
          evidenceIds: [],
        },
      },
    });
  });
});
