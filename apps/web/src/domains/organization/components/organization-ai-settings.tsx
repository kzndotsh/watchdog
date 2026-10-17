import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useUpdateOrganizationSettings } from "@/domains/organization/hooks/use-update-organization-settings";
import { organizationSettingsQuery } from "@/domains/organization/queries";
import { couldnt, errMessage } from "@/lib/utils";
import { FormSection } from "@/shared/ui/form-section";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@watchdog/ui/components/field";
import { Switch } from "@watchdog/ui/components/switch";

/**
 * The organization's external AI handoff switch (default on). Off hides "Open in
 * Claude" and "Open in ChatGPT" for everyone in the organization and makes the server
 * refuse the handoff. Owners and admins change it; everyone else reads it.
 */
export function OrganizationAiSettings({ canEdit }: { canEdit: boolean }) {
  const settings = useQuery(organizationSettingsQuery());
  const update = useUpdateOrganizationSettings();
  const [error, setError] = useState<string | null>(null);
  const enabled = settings.data?.externalAiHandoff ?? true;

  return (
    <FormSection
      title="External AI handoff"
      footerStatus={
        canEdit ? undefined : "Ask an owner or admin to change this."
      }
    >
      <Field orientation="horizontal">
        <div className="flex min-w-0 flex-col gap-0.5">
          <FieldLabel htmlFor="org-ai-handoff">
            Allow &quot;Open in Claude&quot; and &quot;Open in ChatGPT&quot;
          </FieldLabel>
          <FieldDescription>
            When off, a Dossier can only be copied or downloaded, and nothing
            leaves Watchdog through a chat link. Each handoff, when on, is
            recorded in Recent activity.
          </FieldDescription>
        </div>
        <Switch
          id="org-ai-handoff"
          checked={enabled}
          disabled={!canEdit || settings.data === undefined || update.isPending}
          onCheckedChange={(checked) => {
            setError(null);
            update.mutate(
              { externalAiHandoff: checked },
              {
                onError: (mutationError) => {
                  setError(
                    errMessage(mutationError, couldnt("save", "setting"))
                  );
                },
              }
            );
          }}
        />
      </Field>
      <FieldError>{error}</FieldError>
    </FormSection>
  );
}
