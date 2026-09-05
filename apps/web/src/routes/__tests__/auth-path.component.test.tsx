import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useParamsMock = vi.hoisted(() => vi.fn(() => ({ path: "sign-in" })));
const useRouteContextMock = vi.hoisted(() =>
  vi.fn(() => ({ allowSignup: false }))
);

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    getRouteApi: () => ({
      useParams: useParamsMock,
      useRouteContext: useRouteContextMock,
    }),
    redirect: (options: unknown) => {
      throw options;
    },
  };
});

vi.mock("@/auth/ensure-session", () => ({
  ensureAppSession: vi.fn(),
}));

vi.mock("@/auth/ui/auth", () => ({
  Auth: ({ path }: { path: string }) => <div>Auth view {path}</div>,
}));

import { ensureAppSession } from "@/auth/ensure-session";
import { Route } from "@/routes/auth/$path";

describe("auth path route", () => {
  it("redirects invalid auth paths to sign-in", async () => {
    await expect(
      Route.options.beforeLoad!({
        params: { path: "not-a-view" },
        context: { queryClient: {} },
      } as never)
    ).rejects.toEqual(
      expect.objectContaining({
        to: "/auth/$path",
        params: { path: "sign-in" },
      })
    );
  });

  it("redirects signed-in users away from sign-in", async () => {
    vi.mocked(ensureAppSession).mockResolvedValue({
      session: { id: "sess-1" },
      user: { id: "user-1", name: "Analyst" },
    } as Awaited<ReturnType<typeof ensureAppSession>>);

    await expect(
      Route.options.beforeLoad!({
        params: { path: "sign-in" },
        context: { queryClient: {} },
      } as never)
    ).rejects.toEqual(expect.objectContaining({ to: "/" }));
  });

  it("renders the Better Auth view for the path param", () => {
    useParamsMock.mockReturnValue({ path: "sign-in" });
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Auth view sign-in")).toBeInTheDocument();
  });
});
