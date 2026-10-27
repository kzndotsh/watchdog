import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  OPEN_IN_TAB_BLOCKED,
  confirmOpenIn,
  openOpenInTab,
  prepareOpenIn,
  type PendingOpenIn,
} from "@/domains/entities/lib/entity-export";
import { organizationSettingsQuery } from "@/domains/organization/queries";
import { couldnt, errMessage } from "@/lib/utils";
import { invalidateOrganizationSettings } from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import type { OpenInDestination } from "@watchdog/schemas/shared";

type OpenInEntity = {
  caseId: string;
  entitySlug: string;
  entityName: string;
};

/**
 * Open in, for one Dossier: whether the organization allows it, the two-step
 * flow (read and size the text, then confirm) and the pending state between them. Nothing
 * is recorded or opened until `confirm`; `cancel` drops the pending Open in.
 */
export function useOpenIn(entity: OpenInEntity) {
  const queryClient = useQueryClient();
  // Allowed only once the organization is known to allow it: while the setting loads, or
  // when it cannot be read, Open in stays hidden rather than appearing for a moment.
  const settings = useQuery(organizationSettingsQuery());
  const [pending, setPending] = useState<PendingOpenIn | null>(null);

  const prepare = useMutation({
    mutationFn: prepareOpenIn,
    onSuccess: setPending,
    onError: (error: unknown) => {
      toast.error(errMessage(error, couldnt("open", "Markdown in chat")));
    },
  });
  const send = useMutation({
    mutationFn: confirmOpenIn,
    onSuccess: () => {
      setPending(null);
    },
    onError: async (error: unknown) => {
      setPending(null);
      toast.error(errMessage(error, couldnt("record", "Open in")));
      // An organization that turned Open in off in the meantime: hide it here too.
      await invalidateOrganizationSettings(queryClient);
    },
  });

  return {
    isAllowed: settings.data?.openInExternalTools === true,
    pending,
    isConfirming: send.isPending,
    handleStart: (destination: OpenInDestination) => {
      prepare.mutate({ destination, ...entity });
    },
    handleConfirm: () => {
      if (pending === null || send.isPending) return;
      // Opened here, in the click: the dialog stays up so the user can allow pop-ups and retry.
      const tab = openOpenInTab();
      if (tab === null) {
        toast.error(OPEN_IN_TAB_BLOCKED);
        return;
      }
      send.mutate({ openIn: pending, tab });
    },
    handleCancel: () => {
      setPending(null);
    },
  };
}
