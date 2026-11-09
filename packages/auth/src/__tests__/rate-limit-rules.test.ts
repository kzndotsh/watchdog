import { describe, expect, it } from "vitest";

import { db } from "@watchdog/db";

import { createAuth } from "../create-auth";
import {
  AUTH_RATE_LIMIT_RULES,
  needsExplicitRateLimit,
} from "../rate-limit-rules";

const auth = createAuth({ db });

function endpointPaths(): string[] {
  const endpoints = Object.values(
    auth.api as Record<string, { path?: unknown }>
  );
  return [
    ...new Set(
      endpoints.flatMap((endpoint) =>
        typeof endpoint.path === "string" ? [endpoint.path] : []
      )
    ),
  ];
}

describe("auth rate limits", () => {
  it("gives every account-creating and invitation-reading endpoint an explicit rule", () => {
    const covered = endpointPaths().filter(needsExplicitRateLimit);
    expect(covered).toEqual(
      expect.arrayContaining([
        "/sign-up/email",
        "/organization/invite-sign-up",
        "/organization/invitation-preview",
      ])
    );
    const missing = covered.filter((path) => !(path in AUTH_RATE_LIMIT_RULES));
    expect(missing).toEqual([]);
  });

  it("hands the rules to Better Auth unchanged", () => {
    expect(auth.options.rateLimit?.customRules).toEqual(AUTH_RATE_LIMIT_RULES);
  });

  it("names a rule only for an endpoint that exists", () => {
    const paths = new Set(endpointPaths());
    const stale = Object.keys(AUTH_RATE_LIMIT_RULES).filter(
      (path) => !paths.has(path)
    );
    expect(stale).toEqual([]);
  });
});
