import { describe, expect, it } from "vitest";

import { pageHistoryInput } from "../../page.history/input";
import { waybackLookupInput } from "../input";

const url = "https://example.com/page";

describe("wayback.lookup input", () => {
  it("lists distinct versions unless told otherwise", () => {
    expect(waybackLookupInput.parse({ url }).distinctOnly).toBe(true);
    expect(
      waybackLookupInput.parse({ url, distinctOnly: false }).distinctOnly
    ).toBe(false);
  });

  it("accepts a bound at each precision and a blank one as absent", () => {
    const parsed = waybackLookupInput.parse({
      url,
      after: "2019",
      before: "2020-06-15",
    });
    expect(parsed).toMatchObject({ after: "2019", before: "2020-06-15" });
    expect(
      waybackLookupInput.parse({ url, after: "  ", before: "" }).after
    ).toBeUndefined();
  });

  it("rejects a bound that is not a real date, and after later than before", () => {
    expect(
      waybackLookupInput.safeParse({ url, after: "2019-13" }).success
    ).toBe(false);
    expect(
      waybackLookupInput.safeParse({ url, before: "2019-02-30" }).success
    ).toBe(false);
    expect(
      waybackLookupInput.safeParse({ url, after: "last year" }).success
    ).toBe(false);
    const reversed = waybackLookupInput.safeParse({
      url,
      after: "2020-01",
      before: "2019-12",
    });
    expect(reversed.success).toBe(false);
    expect(reversed.error?.issues[0]?.message).toMatch(
      /after must not be later/
    );
  });

  it("accepts a resume key and caps the limit at 100", () => {
    expect(
      waybackLookupInput.parse({ url, resumeKey: "abc", limit: 100 })
    ).toMatchObject({ resumeKey: "abc", limit: 100 });
    expect(waybackLookupInput.safeParse({ url, limit: 101 }).success).toBe(
      false
    );
  });
});

describe("archive.page.history input", () => {
  it("defaults to 10 versions and refuses more than 25 or fewer than 1", () => {
    expect(pageHistoryInput.parse({ url }).maxVersions).toBe(10);
    expect(pageHistoryInput.parse({ url, maxVersions: 25 }).maxVersions).toBe(
      25
    );
    expect(pageHistoryInput.safeParse({ url, maxVersions: 26 }).success).toBe(
      false
    );
    expect(pageHistoryInput.safeParse({ url, maxVersions: 0 }).success).toBe(
      false
    );
  });

  it("validates its bounds like the lookup", () => {
    expect(pageHistoryInput.safeParse({ url, after: "2019-1" }).success).toBe(
      false
    );
    expect(
      pageHistoryInput.safeParse({ url, after: "2021", before: "2020" }).success
    ).toBe(false);
    expect(
      pageHistoryInput.parse({ url, after: "2019", before: "2019" })
    ).toMatchObject({ after: "2019", before: "2019" });
  });
});
