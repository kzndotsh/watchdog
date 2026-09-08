import { viewPaths } from "@better-auth-ui/core";
import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { ensureAppSession } from "@/auth/ensure-session";
import { getAllowSignup } from "@/auth/get-allow-signup";
import { Auth } from "@/auth/ui/auth";
import { AuthProductMark } from "@/auth/ui/auth-product-mark";
import { normalizeRouteSegment } from "@/shared/lib/route-slug";
import { optionalTrimmedSchema } from "@watchdog/schemas";

const validAuthPaths = new Set(Object.values(viewPaths.auth));

const authSearchSchema = z.object({
  redirectTo: optionalTrimmedSchema,
});

const routeApi = getRouteApi("/auth/$path");

function AuthPage() {
  const { path: rawPath } = routeApi.useParams();
  const path = normalizeRouteSegment(rawPath) ?? "sign-in";
  const { allowSignup } = routeApi.useRouteContext();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 py-10">
      <AuthProductMark />
      <Auth path={path} allowSignup={allowSignup} />
    </main>
  );
}

export const Route = createFileRoute("/auth/$path")({
  validateSearch: authSearchSchema,
  beforeLoad: async ({
    params: { path: rawPath },
    context: { queryClient },
  }) => {
    const path = normalizeRouteSegment(rawPath);
    if (path === undefined || !validAuthPaths.has(path)) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
      throw redirect({ to: "/auth/$path", params: { path: "sign-in" } });
    }

    const allowSignup = await getAllowSignup();
    if (path === "sign-up" && !allowSignup) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
      throw redirect({ to: "/auth/$path", params: { path: "sign-in" } });
    }

    // Already signed in → go home (also seeds authQueryKeys.session).
    if (path === "sign-in" || path === "sign-up") {
      const session = await ensureAppSession(queryClient);
      if (session) {
        // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
        throw redirect({ to: "/" });
      }
    }

    return { allowSignup };
  },
  component: AuthPage,
});
