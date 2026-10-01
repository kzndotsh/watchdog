import { useState } from "react";

import { useUpdateCase } from "@/domains/cases/hooks/use-update-case";
import type { CaseRecord } from "@/domains/cases/types";
import { FormSection } from "@/shared/ui/form-section";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import { Switch } from "@watchdog/ui/components/switch";
import { Textarea } from "@watchdog/ui/components/textarea";

interface CaseSettingsFormProps {
  caseId: string;
  caseRow: CaseRecord;
}

export function CaseSettingsForm({ caseId, caseRow }: CaseSettingsFormProps) {
  const serverName = caseRow.name;
  const [nameDraft, setNameDraft] = useState(serverName);
  const [prevName, setPrevName] = useState(serverName);
  if (serverName !== prevName) {
    setPrevName(serverName);
    setNameDraft(serverName);
  }

  const serverDescription = caseRow.description ?? "";
  const [descriptionDraft, setDescriptionDraft] = useState(serverDescription);
  const [prevDescription, setPrevDescription] = useState(serverDescription);
  if (serverDescription !== prevDescription) {
    setPrevDescription(serverDescription);
    setDescriptionDraft(serverDescription);
  }

  const updateMutation = useUpdateCase(caseId, caseRow.slug);

  return (
    <FormSection title="Case settings">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="case-name">Name</FieldLabel>
          <Input
            id="case-name"
            value={nameDraft}
            placeholder="Case name"
            onChange={(e) => {
              setNameDraft(e.target.value);
            }}
            onBlur={() => {
              const next = nameDraft.trim();
              if (!next) {
                setNameDraft(caseRow.name);
                return;
              }
              if (next !== caseRow.name) {
                updateMutation.mutate({ name: next });
              }
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="case-description">Description</FieldLabel>
          <Textarea
            id="case-description"
            value={descriptionDraft}
            rows={3}
            placeholder="What is this Case about?"
            onChange={(e) => {
              setDescriptionDraft(e.target.value);
            }}
            onBlur={() => {
              const next = descriptionDraft.trim();
              const prev = (caseRow.description ?? "").trim();
              if (next !== prev) {
                updateMutation.mutate({
                  description: next,
                });
              }
            }}
          />
        </Field>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <FieldLabel htmlFor="case-egress">Third-party egress</FieldLabel>
            <FieldDescription>
              Let lookups on this Case call outside services.
            </FieldDescription>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-muted-foreground text-xs" aria-hidden>
              {caseRow.allowThirdPartyEgress ? "On" : "Off"}
            </span>
            <Switch
              id="case-egress"
              checked={caseRow.allowThirdPartyEgress}
              onCheckedChange={(checked) => {
                updateMutation.mutate({ allowThirdPartyEgress: checked });
              }}
            />
          </span>
        </div>
      </FieldGroup>
    </FormSection>
  );
}
