import { queryOptions } from "@tanstack/react-query";

import { getOrganizationStateFn } from "@/domains/organization/organization.functions";

const organizationKeys = {
  state: () => ["organization", "state"] as const,
};

/** Fresh on every route entry: the answer changes when the user creates or joins an org. */
export const organizationStateQuery = () =>
  queryOptions({
    queryKey: organizationKeys.state(),
    queryFn: async () => getOrganizationStateFn(),
    staleTime: 0,
  });
