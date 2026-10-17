import { describe, expect, it, vi } from "vitest";

import { navigateAfterActiveCaseSwitch } from "@/shared/lib/active-case-switch";
import { caseRouteScreen } from "@/shared/lib/case-path";
import { buildCaseRecord } from "@/testing/records";

describe("caseRouteScreen", () => {
  it("names the screen under a Case, and null outside one", () => {
    expect(caseRouteScreen("/cases/ada-lovelace")).toBe("overview");
    expect(caseRouteScreen("/cases/ada-lovelace/")).toBe("overview");
    expect(caseRouteScreen("/cases/ada-lovelace/entities")).toBe("entities");
    expect(caseRouteScreen("/cases/ada-lovelace/entities/ada")).toBe(
      "entities"
    );
    expect(caseRouteScreen("/cases/ada-lovelace/collect")).toBe("collect");
    expect(caseRouteScreen("/cases")).toBeNull();
    expect(caseRouteScreen("/")).toBeNull();
    expect(caseRouteScreen("/settings")).toBeNull();
  });
});

describe("navigateAfterActiveCaseSwitch", () => {
  const next = buildCaseRecord({ slug: "beta", name: "Beta" });

  it("keeps the screen and swaps the Case, dropping the old Case's selection", async () => {
    const navigate = vi.fn();
    await navigateAfterActiveCaseSwitch({
      next,
      pathname: "/cases/alpha/entities/ada",
      navigate,
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/cases/$caseSlug/entities",
      params: { caseSlug: "beta" },
      search: {},
      replace: true,
    });
  });

  it("moves the Overview to the new Case's Overview", async () => {
    const navigate = vi.fn();
    await navigateAfterActiveCaseSwitch({
      next,
      pathname: "/cases/alpha",
      navigate,
    });
    expect(navigate).toHaveBeenCalledWith({
      to: "/cases/$caseSlug",
      params: { caseSlug: "beta" },
      replace: true,
    });
  });

  it.each(["/", "/cases", "/settings"])(
    "leaves %s alone: it follows the cookie",
    async (pathname) => {
      const navigate = vi.fn();
      await navigateAfterActiveCaseSwitch({ next, pathname, navigate });
      expect(navigate).not.toHaveBeenCalled();
    }
  );
});
