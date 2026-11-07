import { describe, expect, it } from "vitest";

import { artifactBodyFromContent } from "@/domains/jobs/lib/artifact-body-from-content";

describe("artifactBodyFromContent", () => {
  it("parses json artifact bodies", () => {
    const body = artifactBodyFromContent('{"ok":true}', "application/json");
    expect(body.kind).toBe("json");
  });
});
