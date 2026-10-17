import { describe, expect, it } from "vitest";

import { expandTrustedOrigins } from "../trusted-origins";

describe("expandTrustedOrigins", () => {
  it("is the public URL plus the configured extras for a deployed install", () => {
    const origins = expandTrustedOrigins("https://watchdog.example.test", [
      "https://admin.example.test",
    ]);

    expect(origins).toEqual([
      "https://watchdog.example.test",
      "https://admin.example.test",
    ]);
  });

  it("treats localhost and 127.0.0.1 as the same install in development", () => {
    const origins = expandTrustedOrigins(
      ["http", "://127.0.0.1:3000"].join(""),
      []
    );

    expect(origins).toContain(["http", "://localhost:3000"].join(""));
    expect(origins).toContain(["http", "://127.0.0.1:3000"].join(""));
  });

  it("does not trust other hosts or ports for a deployed install", () => {
    const origins = expandTrustedOrigins("https://watchdog.example.test", []);

    expect(origins).toEqual(["https://watchdog.example.test"]);
  });

  it("drops empty extras", () => {
    expect(expandTrustedOrigins("https://a.example.test", ["", ""])).toEqual([
      "https://a.example.test",
    ]);
  });
});
