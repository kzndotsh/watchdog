import {
  Link,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";

import { useRouteErrorRecovery } from "@/shared/hooks/use-route-error-recovery";
import { Button } from "@/shared/ui/primitives/button";

/**
 * The root error screen: the router's last boundary (root route, and the signed-in layout so a
 * crash in the app shell lands here). It says nothing technical; the error itself goes to the
 * logs and, when configured, the error tracker.
 */
export function RootError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useRouteErrorRecovery(error);

  return (
    <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center px-4 py-12">
      <div
        role="alert"
        className="bg-background text-foreground flex flex-col gap-4 rounded-md border p-6 sm:p-8"
      >
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Something went wrong
        </h1>
        <p className="text-muted-foreground text-base leading-7">
          Watchdog couldn&apos;t show this page. Your saved work is safe. Try
          again, or head back to the dashboard.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              reset();
              void router.invalidate();
            }}
          >
            Try again
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/" />}
          >
            Go to dashboard
          </Button>
        </div>
      </div>
    </main>
  );
}
