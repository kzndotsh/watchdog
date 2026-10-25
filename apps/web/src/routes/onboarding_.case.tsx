import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { ensureOrganizationState } from "@/auth/ensure-organization";
import { ensureAppSession } from "@/auth/ensure-session";
import { CreateCaseForm } from "@/domains/cases/components/create-case-form";
import { useOpenFirstCase } from "@/domains/cases/hooks/use-open-first-case";
import {
  casesContextQuery,
  deletionPolicyQuery,
} from "@/domains/cases/queries";
import { AuthProductMark } from "@/shared/layout/auth-product-mark";
import { Button } from "@/shared/ui/primitives/button";
import { toast } from "@/shared/ui/toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@watchdog/ui/components/card";

function FirstCasePage() {
  const openFirstCase = useOpenFirstCase();
  // Owners and admins can open Deleted Cases; a Case in its restore window is a way out of
  // this step, so they are offered the link.
  const { data: policy } = useQuery(deletionPolicyQuery());

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 py-10">
      <AuthProductMark />
      <Card>
        <CardHeader>
          <CardTitle>Create your first Case</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              A Case is one investigation. It holds the Entities, Evidence, Jobs
              and Tasks you work on. You can create more later.
            </p>
            <CreateCaseForm
              submitLabel="Create Case"
              onError={(message) => {
                toast.error(message);
              }}
              onCreated={openFirstCase}
            />
            <div className="flex flex-wrap gap-2">
              {policy?.canManage === true ? (
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={<Link to="/deleted-cases" />}
                >
                  Restore a deleted Case
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link to="/settings" />}
              >
                Open Settings
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export const Route = createFileRoute("/onboarding_/case")({
  beforeLoad: async ({ context: { queryClient }, location }) => {
    const session = await ensureAppSession(queryClient);
    if (!session) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
      throw redirect({
        to: "/auth/$path",
        params: { path: "sign-in" },
        search: { redirectTo: location.href },
      });
    }

    const { organizationId } = await ensureOrganizationState(
      queryClient,
      session
    );
    if (!organizationId) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
      throw redirect({ to: "/onboarding" });
    }

    // A user who already has a Case is not held here. Read through the query's own
    // freshness, not the guard's static copy, so a Case created elsewhere is seen.
    const { cases } = await queryClient.query(casesContextQuery());
    if (cases.length > 0) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
      throw redirect({ to: "/" });
    }
  },
  component: FirstCasePage,
});
