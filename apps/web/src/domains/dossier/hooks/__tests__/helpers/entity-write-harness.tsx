import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, type Mock } from "vitest";

import { claimsKeys } from "@/domains/entities/claims/queries";
import { edgesKeys } from "@/domains/entities/edges/queries";
import { entitiesKeys } from "@/domains/entities/entities-keys";
import { eventsKeys } from "@/domains/entities/events/queries";
import { identifiersKeys } from "@/domains/entities/identifiers/queries";
import { questionsKeys } from "@/domains/entities/questions/queries";
import { testId } from "@watchdog/test-kit";

const CASE_A = testId(10);
const CASE_B = testId(11);
export const ENTITY_ID = testId(20);
const ENTITY_SLUG = "alpha";

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
    identifiersKeys.all(caseId, ENTITY_ID),
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

interface WriteVerb<V> {
  mutate: (variables: V) => void;
}

/**
 * A write started in Case A settles Case A's Entity caches even when the
 * screen re-renders for Case B before the server answers, and leaves Case B's
 * caches alone. `serverFn` is the mocked server function the hook calls.
 */
export async function expectSettlesStartingCase<V>({
  useVerb,
  serverFn,
  variables,
}: {
  useVerb: () => WriteVerb<V>;
  serverFn: Mock;
  variables: V;
}) {
  let finish: () => void = () => undefined;
  serverFn.mockReturnValue(
    new Promise<unknown>((resolve) => {
      finish = () => {
        resolve({});
      };
    })
  );
  const { wrapper, invalidated } = createHarness();
  const { result, rerender } = renderHook(
    (_props: { activeCaseId: string }) => useVerb(),
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
}

/** A rejected write reports the server's message and leaves every cache untouched. */
export async function expectReportsFailure<V>({
  useVerb,
  serverFn,
  variables,
  onError,
}: {
  useVerb: () => WriteVerb<V>;
  serverFn: Mock;
  variables: V;
  onError: Mock;
}) {
  serverFn.mockRejectedValue(new Error("nope"));
  const { wrapper, invalidated } = createHarness();
  const { result } = renderHook(() => useVerb(), { wrapper });

  act(() => {
    result.current.mutate(variables);
  });

  await waitFor(() => {
    expect(onError).toHaveBeenCalledWith("nope");
  });
  expect(invalidated(CASE_A)).toEqual(settledKeys(CASE_A).map(() => false));
}
