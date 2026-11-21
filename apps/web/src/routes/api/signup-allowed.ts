import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/signup-allowed")({
  server: {
    handlers: {
      GET: async () => {
        const { env } = await import("@watchdog/server/env/server");
        return Response.json({ allowSignup: env.BETTER_AUTH_ALLOW_SIGNUP });
      },
    },
  },
});
