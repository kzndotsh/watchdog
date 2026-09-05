import { describe, expect, it } from "vitest";

import {
  stripTrailingParenthetical,
  toCustomPlatformSlug,
} from "../platform-slug.ts";

describe("platform-slug", () => {
  it("stripTrailingParenthetical removes a trailing group", () => {
    expect(stripTrailingParenthetical("discord (user)")).toBe("discord");
    expect(stripTrailingParenthetical("discord")).toBe("discord");
  });

  it("toCustomPlatformSlug lowercases and collapses junk", () => {
    expect(toCustomPlatformSlug("Boy Moment")).toBe("boy_moment");
    expect(toCustomPlatformSlug("weird!!site")).toBe("weird_site");
    expect(toCustomPlatformSlug("._trim_.")).toBe("trim");
  });
});
