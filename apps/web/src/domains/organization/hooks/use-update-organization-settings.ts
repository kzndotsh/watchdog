import { useMutation, useQueryClient } from "@tanstack/react-query";

import { organizationKeys } from "@/domains/organization/queries";
import { orpc } from "@/lib/orpc-client";
import type { UpdateOrganizationSettingsInput } from "@watchdog/schemas/shared";

/** Change the organization's settings (owner or admin), then put the answer in the cache. */
export function useUpdateOrganizationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOrganizationSettingsInput) =>
      orpc.organization.updateSettings.call(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(organizationKeys.settings(), settings);
    },
  });
}
