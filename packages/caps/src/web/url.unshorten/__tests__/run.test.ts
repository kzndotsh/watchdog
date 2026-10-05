import { afterAll, afterEach, beforeAll, describe } from "vitest";

import { testId } from "@watchdog/test-kit";
import { http, HttpResponse, mockServer } from "@watchdog/test-kit/http";

import { itRunsCollectCap } from "../../../testing";
import { urlUnshorten } from "../cap.ts";

describe("web.url.unshorten run", () => {
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
    cap: urlUnshorten,
    input: { url: "https://t.co/abc", entityId: testId(20) },
    reportContains: "mailhost.test/final",
    setup: () => {
      mockServer.use(
        http.head(
          "https://t.co/abc",
          () =>
            new HttpResponse(null, {
              status: 301,
              headers: { location: "https://mailhost.test/final" },
            })
        ),
        http.head(
          "https://mailhost.test/final",
          () => new HttpResponse(null, { status: 200 })
        )
      );
    },
  });
});
