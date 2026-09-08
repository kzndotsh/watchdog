import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  listCapabilitiesEffect,
  listPlaybookDescriptorsEffect,
} from "../catalog.ts";

describe("caps catalog", () => {
  it.effect("listCapabilitiesEffect returns registered caps", () =>
    Effect.gen(function* listCapsGen() {
      const caps = yield* listCapabilitiesEffect();
      expect(caps.length).toBeGreaterThan(0);
      expect(caps.some((cap) => cap.id === "network.dns.lookup")).toBe(true);
    })
  );

  it.effect("listPlaybookDescriptorsEffect returns playbooks", () =>
    Effect.gen(function* listPlaybooksGen() {
      const playbooks = yield* listPlaybookDescriptorsEffect();
      expect(playbooks.length).toBeGreaterThan(0);
      expect(playbooks.every((pb) => pb.steps.length > 0)).toBe(true);
    })
  );
});
