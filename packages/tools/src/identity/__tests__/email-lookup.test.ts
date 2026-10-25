import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";

const { mockResolver } = vi.hoisted(() => ({
  mockResolver: {
    cancel: vi.fn(),
    resolveMx: vi.fn(),
    resolveTxt: vi.fn(),
  },
}));

vi.mock("node:dns/promises", () => ({
  Resolver: function Resolver() {
    return mockResolver;
  },
}));

import {
  emailLookupSnapshotSchema,
  fetchEmailLookupEffect,
  normalizeEmail,
} from "../email-lookup";

describe("email-lookup", () => {
  it("normalizeEmail lowercases and validates shape", () => {
    expect(normalizeEmail(" Alice@MailHost.Test ")).toEqual({
      email: "alice@mailhost.test",
      domain: "mailhost.test",
    });
    expect(() => normalizeEmail("not-an-email")).toThrow(/Invalid email/);
  });

  it.effect("fetchEmailLookupEffect resolves MX and SPF/DMARC presence", () =>
    Effect.gen(function* fetchEmailLookupGen() {
      mockResolver.resolveMx.mockResolvedValueOnce([
        { exchange: "aspmx.l.google.com", priority: 1 },
      ]);
      mockResolver.resolveTxt.mockImplementation(async (name: string) => {
        if (name === "gmail.com")
          return [["v=spf1 include:_spf.google.com ~all"]];
        if (name === "_dmarc.gmail.com") return [["v=DMARC1; p=reject"]];
        return [];
      });

      const snap = yield* fetchEmailLookupEffect(
        "alice@gmail.com",
        AbortSignal.timeout(5000)
      );

      expect(emailLookupSnapshotSchema.parse(snap).providerHint).toBe("google");
      expect(snap.spfPresent).toBe(true);
      expect(snap.dmarcPresent).toBe(true);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
