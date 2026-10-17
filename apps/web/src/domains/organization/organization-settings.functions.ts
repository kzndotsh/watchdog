import { createServerFn } from "@tanstack/react-start";

import { orpcFromContext } from "@/lib/orpc.server";
import {
  updateOrganizationSettingsInputSchema,
  type OrganizationSettings,
} from "@watchdog/schemas/shared";

export const getOrganizationSettingsFn = createServerFn({
  method: "GET",
}).handler(async ({ context }): Promise<OrganizationSettings> =>
  orpcFromContext(context).organization.getSettings()
);

export const updateOrganizationSettingsFn = createServerFn({ method: "POST" })
  .validator(updateOrganizationSettingsInputSchema)
  .handler(async ({ data, context }): Promise<OrganizationSettings> =>
    orpcFromContext(context).organization.updateSettings(data)
  );
