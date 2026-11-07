import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useStaleVersionToast } from "@/app/hooks/use-stale-version-toast";
import { invalidateAfterEntityChanged } from "@/app/lib/query-invalidation";
import type { EntityScope } from "@/domains/entities/types";
import { couldnt, errMessage } from "@/lib/utils";
import { toast } from "@/shared/ui/toast";

/** What a screen hooks onto a Graph child write; every field is optional. */
export type GraphChildMutationCallbacks = {
  /** Runs when the write lands, before the Entity caches settle (close the open editor). */
  onSuccess?: () => void;
  /** Receives the failure message (`Couldn't <verb> <noun>` unless the server said more). */
  onError?: (message: string) => void;
  /** A save that lost to another writer: runs when the person chooses Reload. */
  onReload?: () => void;
};

type GraphChildMutationSpec<V extends EntityScope, Input, Result> = {
  /** The server function the write calls. */
  fn: (args: { data: Input }) => Promise<Result>;
  /** The variables to the server function's validated input (the Zod parse). */
  parse: (variables: V) => Input;
  /** The success toast; a function reads the variables (the copy depends on the action). */
  success: string | ((variables: V) => string);
  /** The failure copy is `couldnt(verb, noun)`; `noun` also names the row in the stale toast. */
  verb: string;
  noun: string;
};

/**
 * Declares the mutation hook of one Graph child write (a Claim, Connection, Event, Open Question
 * or Identifier of an Entity): the server call, its input parse, the success toast and the failure
 * noun, and nothing else. The hook it returns owns the rest, the same for every child:
 *
 * - Case and Entity travel in the mutation variables (`EntityScope`), so a pending write settles
 *   the Case it was started for after an Active Case switch.
 * - On success: `onSuccess`, then the Entity caches settle (`invalidateAfterEntityChanged`), then
 *   the toast.
 * - On failure: a lost-update (`stale_version`) toasts Reload (a write without a version never
 *   gets one), and `onError` receives `errMessage(couldnt(verb, noun))`.
 *
 * A write with extra behaviour (a cache seed, optimistic state) is its own `useMutation` and calls
 * `invalidateAfterEntityChanged` itself; the factory takes no flag for it.
 */
export function defineGraphChildMutation<V extends EntityScope, Input, Result>({
  fn,
  parse,
  success,
  verb,
  noun,
}: GraphChildMutationSpec<V, Input, Result>) {
  return function useGraphChildMutation({
    onSuccess,
    onError,
    onReload,
  }: GraphChildMutationCallbacks = {}) {
    const queryClient = useQueryClient();
    const notifyStale = useStaleVersionToast();
    return useMutation({
      mutationFn: async (variables: V) => fn({ data: parse(variables) }),
      onSuccess: async (_data, variables) => {
        onSuccess?.();
        await invalidateAfterEntityChanged(queryClient, variables.caseId, {
          entityId: variables.entityId,
        });
        toast.success(
          typeof success === "string" ? success : success(variables)
        );
      },
      onError: (caughtError, { caseId, entityId }) => {
        notifyStale(caughtError, { noun, caseId, entityId, onReload });
        onError?.(errMessage(caughtError, couldnt(verb, noun)));
      },
    });
  };
}
