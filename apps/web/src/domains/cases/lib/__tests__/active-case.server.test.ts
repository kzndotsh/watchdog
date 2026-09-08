import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";

import { ACTIVE_CASE_COOKIE } from "@/domains/cases/lib/active-case";
import {
  readActiveCaseId,
  writeActiveCaseId,
} from "@/domains/cases/lib/active-case.server";

describe("active case cookie helpers", () => {
  const caseId = testId(1);

  it("reads the active case id from the request cookie", () => {
    vi.mocked(getCookie).mockReturnValue(caseId);
    expect(readActiveCaseId()).toBe(caseId);
    expect(getCookie).toHaveBeenCalledWith(ACTIVE_CASE_COOKIE);
  });

  it("trims padded cookie values and treats whitespace-only as unset", () => {
    vi.mocked(getCookie).mockReturnValue(`  ${caseId}  `);
    expect(readActiveCaseId()).toBe(caseId);
    vi.mocked(getCookie).mockReturnValue("   ");
    expect(readActiveCaseId()).toBeNull();
  });

  it("treats invalid cookie values as unset", () => {
    vi.mocked(getCookie).mockReturnValue("case-1");
    expect(readActiveCaseId()).toBeNull();
  });

  it("writes the active case cookie when an id is provided", () => {
    writeActiveCaseId(caseId);
    expect(setCookie).toHaveBeenCalledWith(
      ACTIVE_CASE_COOKIE,
      caseId,
      expect.objectContaining({ httpOnly: true, sameSite: "lax" })
    );
  });

  it("trims padded ids before writing the cookie", () => {
    writeActiveCaseId(`  ${caseId}  `);
    expect(setCookie).toHaveBeenCalledWith(
      ACTIVE_CASE_COOKIE,
      caseId,
      expect.objectContaining({ httpOnly: true, sameSite: "lax" })
    );
  });

  it("clears the active case cookie when id is null, blank, or invalid", () => {
    writeActiveCaseId(null);
    expect(deleteCookie).toHaveBeenCalledWith(ACTIVE_CASE_COOKIE, {
      path: "/",
    });
    vi.mocked(deleteCookie).mockClear();
    writeActiveCaseId("   ");
    expect(deleteCookie).toHaveBeenCalledWith(ACTIVE_CASE_COOKIE, {
      path: "/",
    });
    vi.mocked(deleteCookie).mockClear();
    writeActiveCaseId("case-1");
    expect(deleteCookie).toHaveBeenCalledWith(ACTIVE_CASE_COOKIE, {
      path: "/",
    });
  });
});
