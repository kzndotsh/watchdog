import { describe, expect, it } from "vitest";

import { Route } from "@/routes/_protected/settings/index";

// What the route renders for each tab, who sees Users, and the URL clean-up run through the
// real router in `settings-tabs.component.test.tsx`. This file keeps the search parser.
const validateSearch = Route.options.validateSearch as {
  parse: (value: unknown) => { tab?: string };
};

describe("settings index route search", () => {
  it("treats the retired team tab as no tab", () => {
    expect(validateSearch.parse({ tab: "team" }).tab).toBeUndefined();
  });

  it("keeps a valid settings tab and drops an invalid one", () => {
    expect(validateSearch.parse({ tab: "security" })).toEqual({
      tab: "security",
    });
    expect(validateSearch.parse({ tab: "bogus" }).tab).toBeUndefined();
  });

  it("trims a padded settings tab", () => {
    expect(validateSearch.parse({ tab: "  credentials  " })).toEqual({
      tab: "credentials",
    });
  });
});
