import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth/server", () => ({
  auth: {},
}));

const useSearchMock = vi.hoisted(() => vi.fn(() => ({ tab: undefined })));
const useNavigateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    getRouteApi: () => ({
      useSearch: useSearchMock,
      useNavigate: () => useNavigateMock,
    }),
  };
});

vi.mock("@/auth/ui/api-key/api-keys", () => ({
  ApiKeys: () => <div>API keys panel</div>,
}));

vi.mock("@/auth/ui/settings/settings", () => ({
  Settings: ({ view }: { view: string }) => <div>Auth settings {view}</div>,
}));

vi.mock("@/domains/settings/components/settings-credentials-form", () => ({
  SettingsCredentialsForm: () => <div>Credentials form</div>,
}));

vi.mock("@/domains/settings/components/settings-shell", () => ({
  SETTINGS_TABS: ["account", "security", "api-keys", "credentials"],
  SettingsShell: ({
    activeTab,
    children,
  }: {
    activeTab: string;
    children: React.ReactNode;
  }) => (
    <div>
      Settings shell {activeTab}
      {children}
    </div>
  ),
}));

vi.mock("@/shared/layout/page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeader: () => <div>Settings header</div>,
}));

vi.mock("@/shared/ui/skeletons", () => ({
  StackBodySkeleton: () => <div>Loading credentials</div>,
  StackBodySkeletonLayout: () => <div>Loading credentials layout</div>,
}));

import { Route } from "@/routes/_protected/settings/index";

describe("settings index route", () => {
  it("prefetches credentials in the loader", async () => {
    const prefetchQuery = vi.fn().mockResolvedValue(undefined);
    const loader = Route.options.loader as (ctx: never) => Promise<unknown>;

    await loader({
      context: { queryClient: { prefetchQuery } },
    } as never);

    expect(prefetchQuery).toHaveBeenCalledTimes(1);
  });

  it("renders the account settings panel by default", () => {
    useSearchMock.mockReturnValue({ tab: undefined });
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Settings header")).toBeInTheDocument();
    expect(screen.getByText("Settings shell account")).toBeInTheDocument();
    expect(screen.getByText("Auth settings account")).toBeInTheDocument();
  });

  it("renders the credentials panel when selected", () => {
    useSearchMock.mockReturnValue({ tab: "credentials" } as never);
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText("Settings shell credentials")).toBeInTheDocument();
    expect(screen.getByText("Credentials form")).toBeInTheDocument();
  });
});
