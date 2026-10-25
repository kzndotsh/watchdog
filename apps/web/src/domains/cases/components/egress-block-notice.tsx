import { useQuery } from "@tanstack/react-query";

import { useUpdateCase } from "@/domains/cases/hooks/use-update-case";
import { deletionPolicyQuery } from "@/domains/cases/queries";
import type { CaseEgress } from "@/domains/cases/types";
import {
  egressClassesPhrase,
  type EgressBlock,
} from "@/domains/jobs/lib/egress-block";
import { Button } from "@/shared/ui/primitives/button";
import { normalizeAllowedEgress } from "@watchdog/schemas/caps";
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@watchdog/ui/components/alert";

type EgressBlockNoticeProps = {
  caseEgress: CaseEgress;
  block: EgressBlock;
  /** What the viewer is about to run, as the notice names it. */
  subject: "Cap" | "playbook";
};

/**
 * Why a step cannot run on this Case: the egress classes it needs that the Case does not allow,
 * and where the seed would go. An owner or admin gets the button that allows them; anyone else
 * is told who can. The server refuses a change by anyone else, so the button is a convenience,
 * not the guard.
 */
export function EgressBlockNotice({
  caseEgress,
  block,
  subject,
}: EgressBlockNoticeProps) {
  const { data: policy } = useQuery(deletionPolicyQuery());
  const updateMutation = useUpdateCase(caseEgress.id, caseEgress.slug);
  const canManage = policy?.canManage === true;
  const phrase = egressClassesPhrase(block.classes);
  const where =
    block.destinations.length === 0
      ? ""
      : ` Running this ${subject} would contact ${block.destinations.join(", ")}.`;

  return (
    <Alert>
      <AlertDescription>
        {`This Case does not allow ${phrase}.${where}`}
        {policy !== undefined && !canManage
          ? " Ask an owner or admin to allow it in Case settings."
          : ""}
      </AlertDescription>
      {canManage ? (
        <AlertAction>
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={updateMutation.isPending}
            onClick={() => {
              updateMutation.mutate({
                allowedEgress: normalizeAllowedEgress([
                  ...caseEgress.allowedEgress,
                  ...block.classes,
                ]),
              });
            }}
          >
            {`Allow ${phrase}`}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
