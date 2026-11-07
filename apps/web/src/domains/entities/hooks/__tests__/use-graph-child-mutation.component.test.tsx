import { describe, expect, it, vi } from "vitest";

const serverFn = vi.hoisted(() => vi.fn());
const onError = vi.hoisted(() => vi.fn());

vi.mock("@/shared/ui/toast", async () => {
  const { toastModuleDouble } = await import("@/testing/toast-double");
  return toastModuleDouble();
});

import { defineGraphChildMutation } from "@/domains/entities/hooks/use-graph-child-mutation";
import type { EntityScope } from "@/domains/entities/types";
import { toast } from "@/shared/ui/toast";

import {
  SCOPE_A,
  expectReportsFailure,
  expectSettlesStartingCase,
} from "./helpers/entity-write-harness";

type Variables = EntityScope & { label: string };

const useRenameThing = defineGraphChildMutation({
  fn: serverFn,
  parse: ({ caseId, label }: Variables) => ({ caseId, label }),
  success: ({ label }: Variables) => `Renamed to ${label}`,
  verb: "rename",
  noun: "thing",
});

const variables: Variables = { ...SCOPE_A, label: "Alpha" };

describe("defineGraphChildMutation", () => {
  it("calls the server with the parsed variables, settles the starting Case's Entity caches after onSuccess, and toasts", async () => {
    await expectSettlesStartingCase({
      useVerb: (onDone) => useRenameThing({ onSuccess: onDone }),
      serverFn,
      expectCallbackBeforeInvalidation: true,
      variables,
    });
    expect(serverFn).toHaveBeenCalledWith({
      data: { caseId: SCOPE_A.caseId, label: "Alpha" },
    });
    expect(toast.success).toHaveBeenCalledWith("Renamed to Alpha");
  });

  it("reports a rejected write with the server's message and settles nothing", async () => {
    await expectReportsFailure({
      useVerb: () => useRenameThing({ onError }),
      serverFn,
      variables,
      onError,
    });
  });

  it("reports a server failure as the house copy for the verb and noun", async () => {
    await expectReportsFailure({
      useVerb: () => useRenameThing({ onError }),
      serverFn,
      variables,
      onError,
      rejectWith: { code: "INTERNAL_SERVER_ERROR", status: 500 },
      message: "Couldn't rename thing. Try again.",
    });
  });
});
