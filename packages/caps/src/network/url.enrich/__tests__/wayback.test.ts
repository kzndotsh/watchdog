import { describe, expect, it } from "vitest";

import { waybackArchiveUrl } from "@watchdog/tools";

describe("waybackArchiveUrl", () => {
  it("builds an id_ archive URL", () => {
    expect(waybackArchiveUrl("20200101000000", "https://mailhost.test/")).toBe(
      "https://web.archive.org/web/20200101000000id_/https://mailhost.test/"
    );
  });
});
