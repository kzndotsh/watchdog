import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateOrganizationSettingsFn } from "@/domains/organization/organization-settings.functions";
import { organizationKeys } from "@/domains/organization/queries";
import type { UpdateOrganizationSettingsInput } from "@watchdog/schemas/shared";

/** Change the organization's settings (owner or admin), then put the answer in the cache. */
export function useUpdateOrganizationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOrganizationSettingsInput) =>
      updateOrganizationSettingsFn({ data: input }),
    onSuccess: (settings) => {
      queryClient.setQueryData(organizationKeys.settings(), settings);
    },
  });
}
