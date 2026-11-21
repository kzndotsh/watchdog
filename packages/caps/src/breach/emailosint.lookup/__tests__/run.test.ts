import { afterAll, afterEach, beforeAll, describe } from "vitest";

import { testId } from "@watchdog/domain/test-kit";
import { mockJson, mockServer } from "@watchdog/domain/test-kit/http";

import { itRunsCollectCap } from "../../../testing";
import { emailosintLookup } from "../cap.ts";

describe("breach.emailosint.lookup run", () => {
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
    cap: emailosintLookup,
    input: { email: "alex.morgan@mailhost.test", entityId: testId(20) },
    reportContains: "gitlab",
    credentialName: "EMAILOSINT_API_KEY",
    secrets: { EMAILOSINT_API_KEY: "eo_test" },
    setup: () => {
      mockJson(
        "https://api.emailosint.org/v1/lookup/email",
        {
          accounts: [
            {
              module: { id: "6abe1784436bf40124c43b1d", name: "gitlab" },
              data: { fields: [] },
            },
          ],
          meta: { completed: true, lookup_id: "65fa0b1c2c4a8e0d1c8b2a3f" },
        },
        { method: "post" }
      );
    },
  });
});
