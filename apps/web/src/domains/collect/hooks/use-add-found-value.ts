import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateAfterEntityChanged } from "@/app/lib/query-invalidation";
import { useCreateIdentifier } from "@/domains/entities/identifiers/mutations";
import { entityChangedOpts } from "@/domains/entities/lib/entity-invalidation-opts";
import { jobsKeys } from "@/domains/jobs/jobs-keys";
import { orpc } from "@/lib/orpc-client";
import { couldnt, errMessage } from "@/lib/utils";
import { TOAST_ENTITY_CREATED } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import type { FoundValueRecord } from "@watchdog/domain/schemas/jobs";
import {
  normalizeIdentifierPlatform,
  type EntityKind,
} from "@watchdog/domain/schemas/shared";

type AddFoundValueArgs = {
  readonly caseId: string;
  readonly jobId: string;
  /** The Evidence the Job landed: the new Identifier cites it. */
  readonly evidenceIds: readonly string[];
  readonly onError: (message: string) => void;
};

export type NewEntityFields = { name: string; kind: EntityKind };

/**
 * Add a Job's found value as an Identifier: the Dossier write (not a Proposal), at `unverified`
 * with status `unknown`, citing the Job's Evidence. `add` puts it on an existing Entity;
 * `addAsNewEntity` creates an Entity holding it, in one write. On success the Job's Found list
 * is refreshed, since it names the Entities that hold each value.
 */
export function useAddFoundValue({
  caseId,
  jobId,
  evidenceIds,
  onError,
}: AddFoundValueArgs) {
  const queryClient = useQueryClient();
  const refreshFound = () =>
    queryClient.invalidateQueries({ queryKey: jobsKeys.found(caseId, jobId) });
  const create = useCreateIdentifier({ onError });
  const createEntity = useMutation({
    mutationFn: ({
      value,
      entity,
    }: {
      value: FoundValueRecord;
      entity: NewEntityFields;
    }) =>
      orpc.entities.create.call({
        caseId,
        kind: entity.kind,
        name: entity.name,
        identifier: {
          type: value.type,
          value: value.value,
          platform: normalizeIdentifierPlatform(value.platform) || undefined,
          status: "unknown",
          confidence: "unverified",
          evidenceIds: [...evidenceIds],
        },
      }),
    onSuccess: async (created) => {
      toast.success(TOAST_ENTITY_CREATED);
      await Promise.all([
        invalidateAfterEntityChanged(
          queryClient,
          caseId,
          entityChangedOpts(queryClient, caseId, created.id, created.slug)
        ),
        refreshFound(),
      ]);
    },
  });

  return {
    isPending: create.isPending || createEntity.isPending,
    add: async (
      value: FoundValueRecord,
      entity: { id: string; slug: string }
    ): Promise<boolean> => {
      try {
        await create.mutateAsync({
          caseId,
          entityId: entity.id,
          entitySlug: entity.slug,
          value: {
            type: value.type,
            value: value.value,
            platform: value.platform,
            status: "unknown",
            confidence: "unverified",
            evidenceIds: [...evidenceIds],
          },
        });
      } catch {
        // `onError` has the message.
        return false;
      }
      await refreshFound();
      return true;
    },
    addAsNewEntity: async (
      value: FoundValueRecord,
      entity: NewEntityFields
    ): Promise<boolean> => {
      try {
        await createEntity.mutateAsync({ value, entity });
      } catch (error) {
        onError(errMessage(error, couldnt("create", "entity")));
        return false;
      }
      return true;
    },
  };
}
