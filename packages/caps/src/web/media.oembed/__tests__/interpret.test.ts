import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { mediaOembed } from "../cap.ts";
import { interpretOembedReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    url: "https://vimeo.com/12345",
    queriedAt: "2026-01-01T00:00:00.000Z",
    vendor: "vimeo" as const,
    title: "Clip",
    authorName: "atticus",
    authorUrl: "https://vimeo.com/atticus",
    providerName: "Vimeo",
    thumbnailUrl: null,
    type: "video",
  };

  it("interpretOembedReport proposes handle + url Identifiers", () => {
    const result = interpretOembedReport(fixture, {
      input: { url: fixture.url, entityId },
    });
    const ids = result.patch.filter((p) => p.resource === "identifier");
    expect(
      ids.some(
        (p) =>
          p.data.type === "handle" &&
          p.data.platform === "vimeo" &&
          p.data.value === "@atticus"
      )
    ).toBeTruthy();
    expect(
      ids.some(
        (p) =>
          p.data.type === "url" &&
          typeof p.data.value === "string" &&
          p.data.value.includes("vimeo.com/atticus")
      )
    ).toBeTruthy();
    expect(claimText(result, ids.length)).toMatch(/atticus/);
  });

  it("interpretOembedReport proposes handle from providerName when vendor is null", () => {
    const result = interpretOembedReport(
      { ...fixture, vendor: null },
      { input: { url: fixture.url, entityId } }
    );
    const ids = result.patch.filter((p) => p.resource === "identifier");
    expect(
      ids.some(
        (p) =>
          p.data.type === "handle" &&
          p.data.platform === "vimeo" &&
          p.data.value === "@atticus"
      )
    ).toBeTruthy();
  });

  it("interpretOembedReport empty patch without entityId", () => {
    const result = interpretOembedReport(fixture, {
      input: { url: fixture.url },
    });
    expect(result.patch).toEqual([]);
    expect(String(result.summary)).toMatch(/no Entity/i);
  });

  itRejectsIncompleteReport(
    mediaOembed,
    { url: fixture.url },
    { url: fixture.url }
  );
});
