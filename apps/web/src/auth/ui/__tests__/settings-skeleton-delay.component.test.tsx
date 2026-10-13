import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SKELETON_DELAY_CLASS } from "@/shared/lib/skeleton-delay";

vi.mock("@better-auth-ui/react", () => ({
  useAuth: () => ({
    authClient: {},
    localization: { settings: { activeSessions: "Active sessions" } },
  }),
  useSession: () => ({ data: null }),
  useListSessions: () => ({ data: undefined, isPending: true }),
}));

const { ActiveSessions } =
  await import("@/auth/ui/settings/security/active-sessions");

describe("Settings skeleton show-delay", () => {
  it("ActiveSessions wraps its pending row skeleton, still mounted", () => {
    const { container } = render(<ActiveSessions />);
    const wrapper = container.querySelector(`.${SKELETON_DELAY_CLASS}`);
    expect(wrapper).not.toBeNull();
    expect(
      wrapper?.querySelectorAll("[data-slot='skeleton']").length
    ).toBeGreaterThan(0);
  });
});
