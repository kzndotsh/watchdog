import { describe, expect, it } from "vitest";

import { testHttpOrigin } from "@watchdog/test-kit";

import { expandTrustedOrigins } from "../trusted-origins";

const production = { isProduction: true };
const development = { isProduction: false };

describe("expandTrustedOrigins", () => {
  it("is the public URL plus the configured extras for a deployed install", () => {
    const origins = expandTrustedOrigins(
      "https://watchdog.example.test",
      ["https://admin.example.test"],
      production
    );

    expect(origins).toEqual([
      "https://watchdog.example.test",
      "https://admin.example.test",
    ]);
  });

  it("trusts no other host or port for a deployed install in development either", () => {
    expect(
      expandTrustedOrigins("https://watchdog.example.test", [], development)
    ).toEqual(["https://watchdog.example.test"]);
  });

  it("treats localhost and 127.0.0.1 as the same install on the same port", () => {
    const origins = expandTrustedOrigins(
      testHttpOrigin("127.0.0.1:3000"),
      [],
      production
    );

    expect(origins).toHaveLength(2);
    expect(origins).toEqual(
      expect.arrayContaining([
        testHttpOrigin("127.0.0.1:3000"),
        testHttpOrigin("localhost:3000"),
      ])
    );
  });

  it("trusts the dev-server fallback ports of a local URL only outside production", () => {
    const local = testHttpOrigin("127.0.0.1:3000");

    expect(expandTrustedOrigins(local, [], development)).toContain(
      testHttpOrigin("localhost:3001")
    );
    expect(expandTrustedOrigins(local, [], production)).not.toContain(
      testHttpOrigin("localhost:3001")
    );
  });

  it("keeps a local URL without a port as itself and its twin in production", () => {
    const origins = expandTrustedOrigins(
      testHttpOrigin("localhost"),
      [],
      production
    );

    expect(origins).toHaveLength(2);
    expect(origins).toEqual(
      expect.arrayContaining([
        testHttpOrigin("127.0.0.1"),
        testHttpOrigin("localhost"),
      ])
    );
  });

  it("drops empty extras", () => {
    expect(
      expandTrustedOrigins("https://a.example.test", ["", ""], production)
    ).toEqual(["https://a.example.test"]);
  });
});
