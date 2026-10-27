import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The auth client is the network boundary: sign-out resolves at once, success or failure.
const navigate = vi.fn();
const signOutOutcome = vi.hoisted(() => ({ fails: false }));
vi.mock("@better-auth-ui/react", () => ({
  useAuth: () => ({
    authClient: {},
    basePaths: { auth: "/auth" },
    navigate,
    viewPaths: { auth: { signIn: "sign-in" } },
  }),
  useSignOut: (
    _client: unknown,
    callbacks: { onError: () => void; onSuccess: () => void }
  ) => ({
    mutate: () => {
      if (signOutOutcome.fails) callbacks.onError();
      else callbacks.onSuccess();
    },
  }),
}));

import { SignOut } from "@/auth/ui/sign-out";

function renderWithCachedSettings() {
  const client = new QueryClient();
  client.setQueryData(["organization", "settings"], {
    openInExternalTools: true,
  });
  render(
    <QueryClientProvider client={client}>
      <SignOut />
    </QueryClientProvider>
  );
  return client;
}

describe("SignOut", () => {
  afterEach(() => {
    signOutOutcome.fails = false;
  });

  it.each([
    { outcome: "succeeds", fails: false },
    { outcome: "fails", fails: true },
  ])(
    "drops the previous account's cache when sign-out $outcome",
    async ({ fails }) => {
      signOutOutcome.fails = fails;
      const client = renderWithCachedSettings();

      await waitFor(() => {
        expect(navigate).toHaveBeenCalledWith({
          to: "/auth/sign-in",
          replace: true,
        });
      });
      expect(client.getQueryCache().getAll()).toHaveLength(0);
    }
  );
});
