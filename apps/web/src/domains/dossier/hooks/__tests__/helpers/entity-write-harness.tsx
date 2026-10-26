import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, type Mock } from "vitest";

import { claimsKeys } from "@/domains/entities/claims/queries";
import { edgesKeys } from "@/domains/entities/edges/queries";
import { entitiesKeys } from "@/domains/entities/entities-keys";
import { eventsKeys } from "@/domains/entities/events/queries";
import { identifierListView } from "@/domains/entities/identifiers/queries";
import { questionsKeys } from "@/domains/entities/questions/queries";
import { identifierList } from "@watchdog/schemas/graph";
import { testId } from "@watchdog/test-kit";

export const CASE_A = testId(10);
export const CASE_B = testId(11);
export const ENTITY_ID = testId(20);
export const ENTITY_SLUG = "alpha";

/** The Case + Entity a write is started for, as the mutation variables carry it. */
export const SCOPE_A = {
  caseId: CASE_A,
  entityId: ENTITY_ID,
  entitySlug: ENTITY_SLUG,
};

/** Every query key `invalidateAfterEntityChanged` settles for an Entity of `caseId`. */
function settledKeys(caseId: string) {
  return [
    entitiesKeys.all(caseId),
    entitiesKeys.detail(caseId, ENTITY_SLUG),
    edgesKeys.all(caseId, ENTITY_ID),
    identifierListView.key(
      { caseId },
      identifierList.queryOf({}, { entityId: ENTITY_ID })
    ),
    claimsKeys.all(caseId, ENTITY_ID),
    eventsKeys.all(caseId, ENTITY_ID),
    questionsKeys.all(caseId, ENTITY_ID),
  ] as const;
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  for (const caseId of [CASE_A, CASE_B]) {
    for (const key of settledKeys(caseId)) {
      queryClient.setQueryData(key, []);
    }
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const invalidated = (caseId: string) =>
    settledKeys(caseId).map(
      (key) => queryClient.getQueryState(key)?.isInvalidated === true
    );
  return { queryClient, wrapper, invalidated };
}

type WriteVerb<V> = {
  mutate: (variables: V) => void;
};

/**
 * A write started in Case A settles Case A's Entity caches, not Case B's, even
 * when the screen re-renders for Case B before the server answers: the Case and
 * Entity come from the mutation variables fixed at `mutate`, never from what the
 * hook or screen holds when the answer lands. `serverFn` is the mocked server
 * function the hook calls.
 *
 * `useVerb` receives `onDone`, which the test wires to the hook's success
 * callback; the helper then pins the order every hook inherited from the
 * pre-hook sections: the callback fires before the cache settles. Pass
 * `resolveWith` for the server's answer and read the returned `queryClient`
 * for cache seeds.
 */
export async function expectSettlesStartingCase<V>({
  useVerb,
  serverFn,
  variables,
  resolveWith = {},
  expectCallbackBeforeInvalidation = false,
}: {
  useVerb: (onDone: () => void) => WriteVerb<V>;
  serverFn: Mock;
  variables: V;
  resolveWith?: unknown;
  expectCallbackBeforeInvalidation?: boolean;
}) {
  let finish: () => void = () => undefined;
  serverFn.mockReturnValue(
    new Promise<unknown>((resolve) => {
      finish = () => {
        resolve(resolveWith);
      };
    })
  );
  const { queryClient, wrapper, invalidated } = createHarness();
  const settledAtCallback: boolean[][] = [];
  const onDone = () => {
    settledAtCallback.push(invalidated(CASE_A));
  };
  const { result, rerender } = renderHook(
    (_props: { activeCaseId: string }) => useVerb(onDone),
    { wrapper, initialProps: { activeCaseId: CASE_A } }
  );

  act(() => {
    result.current.mutate(variables);
  });
  rerender({ activeCaseId: CASE_B });
  await waitFor(() => {
    expect(serverFn).toHaveBeenCalledTimes(1);
  });
  expect(serverFn).toHaveBeenCalledWith({
    data: expect.objectContaining({ caseId: CASE_A }),
  });
  expect(invalidated(CASE_A)).toEqual(settledKeys(CASE_A).map(() => false));

  await act(async () => {
    finish();
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(invalidated(CASE_A)).toEqual(settledKeys(CASE_A).map(() => true));
  });
  expect(invalidated(CASE_B)).toEqual(settledKeys(CASE_B).map(() => false));
  if (expectCallbackBeforeInvalidation) {
    expect(settledAtCallback).toEqual([settledKeys(CASE_A).map(() => false)]);
  }
  return { queryClient };
}

/** A rejected write reports the server's message and leaves every cache untouched. */
export async function expectReportsFailure<V>({
  useVerb,
  serverFn,
  variables,
  onError,
  rejectWith = new Error("nope"),
  message = "nope",
}: {
  useVerb: () => WriteVerb<V>;
  serverFn: Mock;
  variables: V;
  onError: Mock;
  /** What the server function rejects with (default: a plain `Error("nope")`). */
  rejectWith?: unknown;
  /** The failure message the hook must report for it. */
  message?: string;
}) {
  serverFn.mockRejectedValue(rejectWith);
  const { wrapper, invalidated } = createHarness();
  const { result } = renderHook(() => useVerb(), { wrapper });

  act(() => {
    result.current.mutate(variables);
  });

  await waitFor(() => {
    expect(onError).toHaveBeenCalledWith(message);
  });
  expect(invalidated(CASE_A)).toEqual(settledKeys(CASE_A).map(() => false));
  expect(invalidated(CASE_B)).toEqual(settledKeys(CASE_B).map(() => false));
}
