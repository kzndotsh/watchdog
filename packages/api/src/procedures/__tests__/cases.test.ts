import { createRouterClient, ORPCError } from "@orpc/server";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  InternalError,
  InvalidError,
  NotFoundError,
} from "@watchdog/core/errors";

const {
  listCasesEffect,
  getCaseByIdEffect,
  createCaseEffect,
  updateCaseEffect,
} = vi.hoisted(() => ({
  listCasesEffect: vi.fn(),
  getCaseByIdEffect: vi.fn(),
  createCaseEffect: vi.fn(),
  updateCaseEffect: vi.fn(),
}));

vi.mock("@watchdog/core/cases", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/cases")>();
  return {
    ...actual,
    listCasesEffect,
    getCaseByIdEffect,
    createCaseEffect,
    updateCaseEffect,
    deleteCaseEffect: vi.fn(),
  };
});

import { create, get, list, update } from "../cases";

const actor = {
  userId: "u1",
  email: "a@test.local",
  name: "Agent",
  organizationId: "org-test",
};

const sampleCase = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Alpha",
  slug: "alpha",
  description: null,
  allowThirdPartyEgress: false,
};

function createClient() {
  return createRouterClient(
    { create },
    {
      context: { headers: new Headers(), actor, authMethod: "session" },
    }
  );
}

describe("cases procedures", () => {
  it("lists cases for authenticated callers", async () => {
    listCasesEffect.mockReturnValueOnce(Effect.succeed([sampleCase]));

    const client = createRouterClient(
      { list, get, create },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(client.list()).resolves.toHaveLength(1);
  });

  it("maps missing cases to NOT_FOUND", async () => {
    getCaseByIdEffect.mockReturnValueOnce(
      new NotFoundError({ entity: "Case", id: "c1" })
    );

    const client = createRouterClient(
      { get },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.get({ caseId: "00000000-0000-4000-8000-000000000001" })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ORPCError && error.code === "NOT_FOUND"
    );
  });

  it("returns 500 with a generic message when a write fails server-side", async () => {
    createCaseEffect.mockReturnValueOnce(
      new InternalError({
        reason: "Failed to create Case",
        cause: new Error('insert into "cases" failed: connection refused'),
      })
    );

    const failure = await createClient()
      .create({ name: "Beta" })
      .then(
        () => undefined,
        (error: unknown) => error
      );

    expect(failure).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
      message: "Internal server error",
    });
    expect(JSON.stringify(failure)).not.toMatch(
      /Failed to create|insert into|connection refused|cases/
    );
  });

  it("keeps caller-fixable failures at 400 with their reason", async () => {
    createCaseEffect.mockReturnValueOnce(
      new InvalidError({ reason: "Name must contain letters or numbers" })
    );

    await expect(createClient().create({ name: "Beta" })).rejects.toMatchObject(
      {
        code: "BAD_REQUEST",
        status: 400,
        message: "Name must contain letters or numbers",
      }
    );
  });

  it("creates a case from validated input", async () => {
    createCaseEffect.mockReturnValueOnce(
      Effect.succeed({
        id: "00000000-0000-4000-8000-000000000002",
        name: "Beta",
        slug: "beta",
        description: null,
        allowThirdPartyEgress: false,
      })
    );

    const client = createRouterClient(
      { create },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(client.create({ name: "Beta" })).resolves.toMatchObject({
      slug: "beta",
    });
  });

  it("rejects an empty case update body", async () => {
    const client = createRouterClient(
      { update },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.update({ caseId: sampleCase.id })
    ).rejects.toMatchObject({
      message: "Input validation failed",
      cause: {
        issues: [{ message: "At least one field is required" }],
      },
    });
  });

  it("allows description-only null updates to clear the description", async () => {
    updateCaseEffect.mockReturnValueOnce(
      Effect.succeed({
        ...sampleCase,
        description: null,
      })
    );

    const client = createRouterClient(
      { update },
      {
        context: {
          headers: new Headers(),
          actor,
          authMethod: "session",
        },
      }
    );

    await expect(
      client.update({ caseId: sampleCase.id, description: null })
    ).resolves.toMatchObject({ description: null });
  });
});
