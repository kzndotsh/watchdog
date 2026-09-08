import { describe, it, expect } from "vitest";

import {
  expectNoConfidenceOnPatch,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { githubLookup } from "../cap.ts";
import { interpretGithubLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    handle: "octocat",
    queriedAt: "2026-01-01T00:00:00.000Z",
    found: true,
    url: "https://github.com/octocat",
    name: "The Octocat",
    bio: null,
    blog: "https://octocat.example/",
    location: "San Francisco",
    company: null,
    publicRepos: 8,
    followers: 100,
    createdAt: "2011-01-25T00:00:00Z",
    status: 200,
    authenticated: false,
  };

  it("interpretGithubLookupReport proposes handle + profile/blog URLs + Claim", () => {
    const result = interpretGithubLookupReport(fixture, {
      input: { handle: "octocat", entityId },
    });
    expect(result.patch.length).toBe(4);
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("handle");
    expect(result.patch[0]?.data.platform).toBe("github");
    expect(result.patch[1]?.resource).toBe("identifier");
    expect(result.patch[1]?.data.type).toBe("url");
    expect(result.patch[2]?.resource).toBe("identifier");
    expect(result.patch[2]?.data.type).toBe("url");
    expect(result.patch[3]?.resource).toBe("claim");
    expectNoConfidenceOnPatch(result);
  });

  it("proposes profile url only when blog is missing", () => {
    const result = interpretGithubLookupReport(
      { ...fixture, blog: null },
      { input: { handle: "octocat", entityId } }
    );
    const urls = result.patch.filter(
      (p) => p.resource === "identifier" && p.data.type === "url"
    );
    expect(urls).toHaveLength(1);
    expect(urls[0]?.data.value).toBe("https://github.com/octocat");
  });

  it("proposes the queried handle when the profile is not found", () => {
    const result = interpretGithubLookupReport(
      { ...fixture, found: false, url: null, blog: null },
      { input: { handle: "octocat", entityId } }
    );
    expect(result.patch.length).toBe(2);
    expect(result.patch[0]?.resource).toBe("identifier");
    expect(result.patch[0]?.data.type).toBe("handle");
    expect(result.patch[0]?.data.value).toBe("octocat");
    expect(result.patch[1]?.resource).toBe("claim");
  });

  itRejectsIncompleteReport(githubLookup, { handle: "x" }, { handle: "x" });
});
