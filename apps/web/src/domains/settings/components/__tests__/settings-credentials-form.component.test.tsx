import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { CredentialSlot } from "@watchdog/core";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("@/auth/server", () => ({
  auth: {},
}));

const useQueryMock = vi.hoisted(() => vi.fn());
const deleteMutateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useMutation: (options: {
      mutationFn: (name: string) => Promise<unknown>;
      onSuccess?: () => void | Promise<void>;
      onError?: (error: unknown) => void;
    }) => ({
      mutate: (name: string) => {
        void options
          .mutationFn(name)
          .then(() => options.onSuccess?.())
          .catch((error) => options.onError?.(error));
        deleteMutateMock(name);
      },
      isPending: false,
    }),
  };
});

vi.mock("@/domains/settings/settings.functions", () => ({
  putCredentialFn: vi.fn(),
  deleteCredentialFn: vi.fn(),
}));

vi.mock("@/shared/lib/query-invalidation", () => ({
  invalidateAfterCredentialMutation: vi.fn(),
}));

vi.mock("@/shared/ui/shadcn/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { SettingsCredentialsForm } from "@/domains/settings/components/settings-credentials-form";
import {
  deleteCredentialFn,
  putCredentialFn,
} from "@/domains/settings/settings.functions";

const CONNECTED: CredentialSlot = {
  name: "SHODAN_API_KEY",
  label: "Shodan",
  description: "Shodan API key for host lookup caps.",
  configured: true,
  updatedAt: "2026-01-01T12:00:00.000Z",
};

const DISCONNECTED: CredentialSlot = {
  name: "HIBP_API_KEY",
  label: "Have I Been Pwned",
  description: "HIBP API key for breach lookup.",
  configured: false,
  updatedAt: null,
};

function queryLoaded<T>(data: T) {
  return {
    data,
    isFetched: true,
    isLoading: false,
    isError: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  };
}

function queryPendingWithError(error: Error) {
  return {
    data: undefined,
    isFetched: true,
    isLoading: false,
    isError: true,
    error,
    isPlaceholderData: false,
    isFetching: true,
    refetch: vi.fn(),
  };
}

function renderForm(slots: CredentialSlot[]) {
  useQueryMock.mockReturnValue(queryLoaded(slots));

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <SettingsCredentialsForm />
    </QueryClientProvider>
  );
}

describe("SettingsCredentialsForm", () => {
  it("shows an empty state when no credential slots exist", () => {
    renderForm([]);
    expect(
      screen.getByText("No Cap credential slots registered.")
    ).toBeInTheDocument();
  });

  it("shows loading instead of an error while credentials are refetching", () => {
    useQueryMock.mockReturnValue(
      queryPendingWithError(new Error("Credentials unavailable"))
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <SettingsCredentialsForm />
      </QueryClientProvider>
    );

    expect(
      screen.queryByText("Credentials unavailable")
    ).not.toBeInTheDocument();
  });

  it("groups connected and disconnected slots with the expected actions", () => {
    renderForm([CONNECTED, DISCONNECTED]);

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByText("Shodan")).toBeInTheDocument();
    expect(screen.getByText("Have I Been Pwned")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(
      screen.getByLabelText("Pending", { selector: "[data-status='pending']" })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Succeeded", {
        selector: "[data-status='succeeded']",
      })
    ).toBeInTheDocument();
  });

  it("saves a secret from the configure dialog", async () => {
    vi.mocked(putCredentialFn).mockResolvedValue(CONNECTED);

    renderForm([DISCONNECTED]);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(
      screen.getByRole("heading", { name: "Connect Have I Been Pwned" })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("API key / secret"), {
      target: { value: "secret-value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(putCredentialFn).toHaveBeenCalledWith({
        data: { name: "HIBP_API_KEY", secret: "secret-value" },
      });
    });
  });

  it("shows save errors inside the configure dialog", async () => {
    vi.mocked(putCredentialFn).mockRejectedValue(new Error("vault locked"));

    renderForm([DISCONNECTED]);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.change(screen.getByLabelText("API key / secret"), {
      target: { value: "secret-value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(
        screen.getByRole("alertdialog").querySelector("[role='alert']")
      ).toHaveTextContent("vault locked");
    });
  });

  it("removes a configured credential after type-to-confirm", async () => {
    vi.mocked(deleteCredentialFn).mockResolvedValue({ ok: true });

    renderForm([CONNECTED]);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(
      screen.getByRole("heading", { name: "Remove credential" })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("SHODAN_API_KEY"), {
      target: { value: "SHODAN_API_KEY" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove credential" }));

    await waitFor(() => {
      expect(deleteMutateMock).toHaveBeenCalledWith("SHODAN_API_KEY");
      expect(deleteCredentialFn).toHaveBeenCalledWith({
        data: { name: "SHODAN_API_KEY" },
      });
    });
  });
});
