import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { CreateCaseForm } from "@/domains/cases/components/create-case-form";
import { useOpenFirstCase } from "@/domains/cases/hooks/use-open-first-case";
import { deletionPolicyQuery } from "@/domains/cases/queries";
import { Button } from "@/shared/ui/primitives/button";
import { toast } from "@/shared/ui/toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@watchdog/ui/components/card";

/**
 * Onboarding's second step: "Create your first Case". Shown on `/onboarding` once the user
 * has an organization and it has no live Case. Settings is always offered; owners and admins
 * (the only roles that may restore) also get the way to Deleted Cases.
 */
export function FirstCaseStep() {
  const openFirstCase = useOpenFirstCase();
  const { data: policy } = useQuery(deletionPolicyQuery());

  return (
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
  );
}
