import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useParamsMock = vi.hoisted(() =>
  vi.fn(() => ({ invitationId: "inv-test-1" }))
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    getRouteApi: () => ({
      useParams: useParamsMock,
    }),
  };
});

vi.mock("@/auth/ui/accept-invitation", () => ({
  AcceptInvitation: ({ invitationId }: { invitationId: string }) => (
    <div>Accept invitation {invitationId}</div>
  ),
}));

vi.mock("@/auth/ui/auth-product-mark", () => ({
  AuthProductMark: () => <div>Watchdog mark</div>,
}));

import { Route } from "@/routes/auth/accept-invitation.$invitationId";

describe("accept-invitation route", () => {
  it("passes invitationId from params into AcceptInvitation", () => {
    useParamsMock.mockReturnValue({ invitationId: "inv-test-1" });
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Watchdog mark")).toBeInTheDocument();
    expect(
      screen.getByText("Accept invitation inv-test-1")
    ).toBeInTheDocument();
  });
});
