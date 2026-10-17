import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  confirmAiHandoff,
  prepareAiHandoff,
  type PendingAiHandoff,
} from "@/domains/entities/lib/entity-export";
import { organizationSettingsQuery } from "@/domains/organization/queries";
import { couldnt, errMessage } from "@/lib/utils";
import { invalidateOrganizationSettings } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import type { AiHandoffDestination } from "@watchdog/schemas/shared";

type AiHandoffEntity = {
  caseId: string;
  entitySlug: string;
  entityName: string;
};

/**
 * The external AI handoff of one Dossier: whether the organization allows it, the two-step
 * flow (read and size the text, then confirm) and the pending state between them. Nothing
 * is recorded or opened until `confirm`; `cancel` drops the pending handoff.
 */
export function useAiHandoff(entity: AiHandoffEntity) {
  const queryClient = useQueryClient();
  // Allowed only once the organization is known to allow it: while the setting loads, or
  // when it cannot be read, the handoff stays hidden rather than appearing for a moment.
  const settings = useQuery(organizationSettingsQuery());
  const [pending, setPending] = useState<PendingAiHandoff | null>(null);

  const prepare = useMutation({
    mutationFn: prepareAiHandoff,
    onSuccess: setPending,
    onError: (error: unknown) => {
      toast.error(errMessage(error, couldnt("open", "Markdown in chat")));
    },
  });
  const send = useMutation({
    mutationFn: confirmAiHandoff,
    onSuccess: () => {
      setPending(null);
    },
    onError: async (error: unknown) => {
      setPending(null);
      toast.error(errMessage(error, couldnt("record", "the handoff")));
      // An organization that turned the handoff off in the meantime: hide it here too.
      await invalidateOrganizationSettings(queryClient);
    },
  });

  return {
    isAllowed: settings.data?.externalAiHandoff === true,
    pending,
    isConfirming: send.isPending,
    handleStart: (destination: AiHandoffDestination) => {
      prepare.mutate({ destination, ...entity });
    },
    handleConfirm: () => {
      if (pending !== null) send.mutate(pending);
    },
    handleCancel: () => {
      setPending(null);
    },
  };
}
