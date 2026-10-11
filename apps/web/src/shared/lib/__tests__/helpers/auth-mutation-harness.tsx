import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, vi, type Mock } from "vitest";

import { toast } from "@/shared/ui/toast";

type AuthMutation<V> = {
  mutate: (variables: V) => void;
  isSuccess: boolean;
  isError: boolean;
  error: unknown;
};

/** What a Better Auth client call answers: `{ error }` for a refused call, rejected for a transport failure. */
type AuthAnswer =
  | { kind: "ok"; data?: unknown }
  | { kind: "refused"; message?: string }
  | { kind: "rejected"; message: string };

function answerOf(answer: AuthAnswer) {
  if (answer.kind === "ok") return { data: answer.data ?? null, error: null };
  if (answer.kind === "refused") {
    return { data: null, error: { message: answer.message } };
  }
  return undefined;
}

/**
 * Drive a hook that wraps a Better Auth client call. The test client is seeded with
 * `seed` query keys; the run returns, in order, what the hook did: `callback` (the success
 * callback handed to `useVerb`), `toast.success`, `toast.error` and `invalidate` (a call to
 * `queryClient.invalidateQueries`, with its key).
 */
export async function runAuthMutation<V>({
  useVerb,
  authCall,
  answer,
  variables,
  seed = [],
}: {
  useVerb: (onDone: () => void) => AuthMutation<V>;
  authCall: Mock;
  answer: AuthAnswer;
  variables: V;
  seed?: readonly (readonly unknown[])[];
}) {
  const events: string[] = [];
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  authCall.mockClear();
  vi.mocked(toast.success).mockImplementation(() => {
    events.push("toast.success");
    return "toast-id";
  });
  vi.mocked(toast.error).mockImplementation(() => {
    events.push("toast.error");
    return "toast-id";
  });
  if (answer.kind === "rejected") {
    authCall.mockRejectedValue(new Error(answer.message));
  } else {
    authCall.mockResolvedValue(answerOf(answer));
  }

  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  for (const key of seed) queryClient.setQueryData(key, []);
  const invalidate = queryClient.invalidateQueries.bind(queryClient);
  vi.spyOn(queryClient, "invalidateQueries").mockImplementation(
    async (filters, options) => {
      events.push("invalidate");
      return invalidate(filters, options);
    }
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () =>
      useVerb(() => {
        events.push("callback");
      }),
    { wrapper }
  );

  act(() => {
    result.current.mutate(variables);
  });
  await waitFor(() => {
    expect(result.current.isSuccess || result.current.isError).toBe(true);
  });

  return {
    events,
    result,
    invalidated: (key: readonly unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated === true,
  };
}
