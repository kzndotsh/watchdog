// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  };
});

const { Route } = await import("@/routes/_protected/library");

const validateSearch = Route.options.validateSearch as {
  parse: (value: unknown) => { id?: string; kind?: string };
};

describe("Library validateSearch", () => {
  it("accepts a bare /library with no search params", () => {
    expect(validateSearch.parse({})).toEqual({});
  });

  it("trims tokens, drops blanks and non-strings", () => {
    expect(validateSearch.parse({ id: "  cap:network.dns.lookup  " })).toEqual({
      id: "cap:network.dns.lookup",
    });
    expect(validateSearch.parse({ id: "   ", kind: 42 })).toEqual({
      id: undefined,
      kind: undefined,
    });
  });
});
