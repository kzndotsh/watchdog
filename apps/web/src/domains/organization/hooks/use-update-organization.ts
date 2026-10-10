import { authQueryKeys } from "@better-auth-ui/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { authClient } from "@/auth/client";

export interface UpdateOrganizationVariables {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
}

/** Rename the organization (or change its slug / logo), then refresh the auth caches. */
export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOrganizationVariables) => {
      const { error } = await authClient.organization.update({
        organizationId: input.id,
        data: {
          name: input.name,
          slug: input.slug,
          logo: input.logo ?? "",
        },
      });
      if (error) throw new Error(error.message ?? "Couldn't save");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
    },
  });
}
