import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleExportEventEffect } = vi.hoisted(() => ({
  handleExportEventEffect: vi.fn(() => Effect.void),
}));

vi.mock("../export-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../export-events")>();
  return {
    ...actual,
    handleExportEventEffect,
  };
});

import { Db } from "@watchdog/core/worker";

import { handleExportEventPayloadEffect } from "../boot-worker";

describe("handleExportEventPayloadEffect", () => {
  beforeEach(() => {
    handleExportEventEffect.mockReset();
    handleExportEventEffect.mockReturnValue(Effect.void);
  });

  it("ignores malformed JSON without scheduling export", async () => {
    await Effect.runPromise(
      Effect.provide(handleExportEventPayloadEffect("{not json"), Db.layer)
    );
    expect(handleExportEventEffect).not.toHaveBeenCalled();
  });

  it("ignores valid JSON that fails the watchdog event schema", async () => {
    await Effect.runPromise(
      Effect.provide(
        handleExportEventPayloadEffect(JSON.stringify({ type: "unknown" })),
        Db.layer
      )
    );
    expect(handleExportEventEffect).not.toHaveBeenCalled();
  });

  it("schedules export for valid watchdog events", async () => {
    const event = {
      type: "entity_changed",
      caseId: "11111111-1111-4111-8111-000000000001",
    };
    await Effect.runPromise(
      Effect.provide(
        handleExportEventPayloadEffect(JSON.stringify(event)),
        Db.layer
      )
    );
    await vi.waitFor(() => {
      expect(handleExportEventEffect).toHaveBeenCalledWith(event);
    });
  });

  it("ignores watchdog events with empty or invalid caseId", async () => {
    await Effect.runPromise(
      Effect.provide(
        handleExportEventPayloadEffect(
          JSON.stringify({ type: "entity_changed", caseId: "   " })
        ),
        Db.layer
      )
    );
    expect(handleExportEventEffect).not.toHaveBeenCalled();
  });

  it("ignores non-triggering watchdog events without forking export", async () => {
    await Effect.runPromise(
      Effect.provide(
        handleExportEventPayloadEffect(
          JSON.stringify({
            type: "task_changed",
            caseId: "11111111-1111-4111-8111-000000000001",
          })
        ),
        Db.layer
      )
    );
    expect(handleExportEventEffect).not.toHaveBeenCalled();
  });
});
