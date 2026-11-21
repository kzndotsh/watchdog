import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

import { authClient } from "@/auth/client";
import { apiKeyPlugin } from "@/auth/plugins/api-key";
// Side-effect: widens BA UI `AuthPluginRegister` for shadcn-typed plugins.
import "@/auth/plugins/types";
import { AuthProvider } from "@/auth/ui/auth-provider";

const plugins = [apiKeyPlugin()];

function AuthLink({
  href,
  ...props
}: { href: string } & Record<string, unknown>) {
  return <Link to={href} {...props} />;
}

/**
 * BA UI passes paths that may include a query string (`/auth/sign-in?redirectTo=…`).
 * TanStack Router wants `to` + `search` separately.
 */
const AUTH_ROUTE_BASE = ["http", "://local.invalid"].join("");

function useAuthNavigate() {
  const navigate = useNavigate();

  return ({ to, replace }: { to: string; replace?: boolean }) => {
    const url = new URL(to, AUTH_ROUTE_BASE);
    const search = Object.fromEntries(url.searchParams.entries());
    void navigate({
      to: url.pathname,
      search: Object.keys(search).length > 0 ? search : undefined,
      replace,
    });
  };
}

/** Auth + chrome providers. QueryClientProvider is the router's `Wrap` (`router.tsx`). */
export function Providers({ children }: { children: ReactNode }) {
  const navigate = useAuthNavigate();
  const router = useRouter();
  const queryClient = router.options.context.queryClient;

  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <AuthProvider
      authClient={authClient}
      navigate={navigate}
      queryClient={queryClient}
      redirectTo="/"
      emailAndPassword={{ enabled: true }}
      plugins={plugins}
      Link={AuthLink}
    >
      {children}
    </AuthProvider>
  );
}
