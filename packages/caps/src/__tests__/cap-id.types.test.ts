import { describe, it } from "vitest";

import {
  EVIDENCE_EXTRACT_AI_CAPABILITY_ID,
  EVIDENCE_HARVEST_CAPABILITY_ID,
  URL_ENRICH_CAPABILITY_ID,
} from "@watchdog/schemas/jobs";

import type { PlaybookDef } from "../playbooks/plan";
import type { CapId } from "../registry";

/** Fails typecheck when a Cap id named in `@watchdog/schemas` is not a registered Cap. */
const SCHEMA_CAP_IDS = [
  EVIDENCE_EXTRACT_AI_CAPABILITY_ID,
  EVIDENCE_HARVEST_CAPABILITY_ID,
  URL_ENRICH_CAPABILITY_ID,
] as const satisfies readonly CapId[];

describe("CapId", () => {
  it("types a Playbook step and the schemas Cap-id constants", () => {
    const ok: PlaybookDef["steps"] = [
      "network.dns.lookup",
      { capabilityId: "archive.wayback.lookup", input: { limit: 25 } },
    ];
    // @ts-expect-error a misspelled Cap id is not a registered Cap
    const misspelled: PlaybookDef["steps"] = ["network.dns.lookpu"];
    // @ts-expect-error a misspelled Cap id in a step object fails too
    const misspelledObject: PlaybookDef["steps"] = [{ capabilityId: "nope" }];
    void [ok, misspelled, misspelledObject, SCHEMA_CAP_IDS];
  });
});
