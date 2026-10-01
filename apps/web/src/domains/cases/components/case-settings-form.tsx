import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { updateCaseFn } from "@/domains/cases/cases.functions";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import { writeCaseRecordCache } from "@/domains/cases/lib/case-cache";
import { buildUpdateCaseData } from "@/domains/cases/lib/case-write";
import type { CaseRecord } from "@/domains/cases/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";
import { TOAST_CASE_UPDATED } from "@/shared/lib/toast-copy";
import { FormSection } from "@/shared/ui/form-section";
import { toast } from "@/shared/ui/toast";
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  const updateMutation = useMutation({
    mutationFn: async (vars: {
      name?: string;
      description?: string | null;
      allowThirdPartyEgress?: boolean;
    }) => updateCaseFn({ data: buildUpdateCaseData(caseId, vars) }),
    onSuccess: async (updated) => {
      writeCaseRecordCache(queryClient, updated, { slug: caseRow.slug });
      notifyCasesChanged();
      toast.success(TOAST_CASE_UPDATED);
      if (updated.slug !== caseRow.slug) {
        await navigate({
          to: "/cases/$caseSlug",
          params: { caseSlug: updated.slug },
          replace: true,
        });
      }
      await invalidateAfterCaseSwitch(queryClient);
    },
    onError: (err) => {
      toast.error(errMessage(err, "Update failed"));
    },
  });

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
