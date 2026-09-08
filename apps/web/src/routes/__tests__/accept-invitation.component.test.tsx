import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const INVITATION_ID = "00000000-0000-4000-8000-000000000001";

const useParamsMock = vi.hoisted(() =>
  vi.fn(() => ({ invitationId: INVITATION_ID }))
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
    useParamsMock.mockReturnValue({ invitationId: INVITATION_ID });
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Watchdog mark")).toBeInTheDocument();
    expect(
      screen.getByText(`Accept invitation ${INVITATION_ID}`)
    ).toBeInTheDocument();
  });

  it("trims padded invitationId from params", () => {
    useParamsMock.mockReturnValue({
      invitationId: `  ${INVITATION_ID}  `,
    });
    const Page = Route.options.component!;
    render(<Page />);
    expect(
      screen.getByText(`Accept invitation ${INVITATION_ID}`)
    ).toBeInTheDocument();
  });

  it("shows an error for invalid invitation ids", () => {
    useParamsMock.mockReturnValue({ invitationId: "not-a-uuid" });
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Invitation link is invalid")).toBeInTheDocument();
  });
});
