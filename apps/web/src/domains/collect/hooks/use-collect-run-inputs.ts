import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { entityPickerPort } from "@/domains/entities/queries";
import { urlDumpsQuery } from "@/domains/intake/queries";
import {
  credentialsKeys,
  credentialsListQuery,
} from "@/domains/settings/queries";
import { listPending } from "@/shared/lib/list-pending";
import { queryLoadError } from "@/shared/lib/query-load-error";

const EMPTY_URL_DUMPS: never[] = [];
const EMPTY_CREDENTIAL_SLOTS: never[] = [];

/**
 * What the ingress forms read besides the queue: the Entity picker port (the pickers search on the
 * server and title a value by id, never the whole Case), the URL dumps a playbook can seed from (only while the Run popover is open) and which
 * credentials are configured.
 */
export function useCollectRunInputs(caseId: string, isRunOpen: boolean) {
  const queryClient = useQueryClient();
  const entityPort = useMemo(() => entityPickerPort(caseId), [caseId]);
  const urlDumpsRead = useQuery(urlDumpsQuery(caseId, isRunOpen));
  const credentialsQuery = useQuery(credentialsListQuery());
  const configuredCredentials = useMemo(() => {
    const names = new Set<string>();
    for (const slot of credentialsQuery.data ?? EMPTY_CREDENTIAL_SLOTS) {
      if (slot.configured) names.add(slot.name);
    }
    return names;
  }, [credentialsQuery.data]);
  const credentialsPending = listPending(credentialsQuery);
  const credentialsError = credentialsQuery.isError;
  const credentialsLoadError = queryLoadError(
    credentialsQuery,
    credentialsPending,
    "Failed to load credentials"
  );
  const retryCredentials = useCallback(() => {
    if (!credentialsError) return;
    void queryClient.invalidateQueries({ queryKey: credentialsKeys.all });
  }, [credentialsError, queryClient]);

  return {
    entityPort,
    urlDumps: urlDumpsRead.data ?? EMPTY_URL_DUMPS,
    configuredCredentials,
    credentialsLoadError,
    credentialsPending,
    retryCredentials,
  };
}
