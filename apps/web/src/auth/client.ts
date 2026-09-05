import { apiKeyClient } from "@better-auth/api-key/client";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { instanceAdminAccess } from "@/auth/instance-admin";

export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? undefined : window.location.origin,
  plugins: [
    apiKeyClient(),
    organizationClient(),
    adminClient({
      ac: instanceAdminAccess.ac,
      roles: instanceAdminAccess.roles,
    }),
  ],
});
