import { afterAll, afterEach, beforeAll, describe } from "vitest";

import { testId } from "@watchdog/test-kit";
import { mockJson, mockServer } from "@watchdog/test-kit/http";

import { itRunsCollectCap } from "../../../testing";
import { virusTotalLookup } from "../cap.ts";

describe("threat.virustotal.lookup run", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  itRunsCollectCap({
    cap: virusTotalLookup,
    input: { query: "8.8.8.8", entityId: testId(20) },
    reportContains: "Google LLC",
    credentialName: "VIRUSTOTAL_API_KEY",
    secrets: { VIRUSTOTAL_API_KEY: "vt-test" },
    setup: () => {
      mockJson("https://www.virustotal.com/api/v3/ip_addresses/8.8.8.8", {
        data: {
          attributes: {
            reputation: 0,
            last_analysis_stats: {
              malicious: 0,
              suspicious: 0,
              harmless: 60,
              undetected: 30,
            },
            as_owner: "Google LLC",
            asn: 15_169,
            country: "US",
            network: "8.8.8.0/24",
          },
        },
      });
    },
  });
});
