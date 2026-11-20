import { useQueryClient } from "@tanstack/react-query";

import { useCreateIdentifier } from "@/domains/entities/identifiers/mutations";
import { jobsKeys } from "@/domains/jobs/jobs-keys";
import type { FoundValueRecord } from "@watchdog/schemas/jobs";

type AddFoundValueArgs = {
  readonly caseId: string;
  readonly jobId: string;
  /** The Evidence the Job landed: the new Identifier cites it. */
  readonly evidenceIds: readonly string[];
  readonly onError: (message: string) => void;
};

/**
 * Add a Job's found value to an Entity as an Identifier: the Dossier write (not a Proposal), at
 * `unverified` with status `unknown`, citing the Job's Evidence. On success the Job's Found list
 * is refreshed, since it names the Entities that hold each value.
 */
export function useAddFoundValue({
  caseId,
  jobId,
  evidenceIds,
  onError,
}: AddFoundValueArgs) {
  const queryClient = useQueryClient();
  const create = useCreateIdentifier({ onError });
  return {
    isPending: create.isPending,
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
      await queryClient.invalidateQueries({
        queryKey: jobsKeys.found(caseId, jobId),
      });
      return true;
    },
  };
}
