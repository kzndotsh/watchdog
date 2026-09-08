import { describe, expect, it } from "vitest";

import {
  playbookSeedOk,
  playbookSeedRequirements,
} from "@/domains/jobs/lib/playbook-seed-requirements";
import type { PlaybookListItem } from "@/domains/jobs/types";
import { testId } from "@watchdog/test-kit";

const urlEvidencePlaybook = {
  id: "url-resolve",
  seedKinds: ["url", "evidence"],
} as PlaybookListItem;

describe("playbookSeedOk", () => {
  it("requires a valid evidence UUID when evidence seed is needed", () => {
    const requirements = playbookSeedRequirements(urlEvidencePlaybook);
    const evidenceId = testId(1);
    expect(
      playbookSeedOk({
        requirements,
        host: "",
        ip: "",
        email: "",
        hash: "",
        handle: "",
        url: "https://example.com",
        evidenceId: `  ${evidenceId}  `,
      })
    ).toBe(true);
    expect(
      playbookSeedOk({
        requirements,
        host: "",
        ip: "",
        email: "",
        hash: "",
        handle: "",
        url: "https://example.com",
        evidenceId: "not-a-uuid",
      })
    ).toBe(false);
    expect(
      playbookSeedOk({
        requirements,
        host: "",
        ip: "",
        email: "",
        hash: "",
        handle: "",
        url: "https://example.com",
        evidenceId: "   ",
      })
    ).toBe(false);
  });
});
