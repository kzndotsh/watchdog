import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { updateCaseFn } from "@/domains/cases/cases.functions";
import { notifyCasesChanged } from "@/domains/cases/lib/active-case";
import { writeCaseRecordCache } from "@/domains/cases/lib/case-cache";
import { buildUpdateCaseData } from "@/domains/cases/lib/case-write";
import type { CaseRecord } from "@/domains/cases/types";
import { errMessage } from "@/lib/utils";
import { invalidateAfterCaseSwitch } from "@/shared/lib/query-invalidation";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/shadcn/field";
import { Input } from "@/shared/ui/shadcn/input";
import { Switch } from "@/shared/ui/shadcn/switch";
import { Textarea } from "@/shared/ui/shadcn/textarea";

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
      toast.success("Updated");
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
    <section
      aria-label="Case settings"
      className="border-border flex flex-col gap-3 rounded-md border p-3"
    >
      <h2 className="text-label-sm text-muted-foreground font-medium">
        Case settings
      </h2>
      <FieldGroup className="gap-3">
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
        <Field orientation="horizontal">
          <Switch
            id="case-egress"
            checked={caseRow.allowThirdPartyEgress}
            onCheckedChange={(checked) => {
              updateMutation.mutate({ allowThirdPartyEgress: checked });
            }}
          />
          <FieldContent>
            <FieldLabel htmlFor="case-egress">Third-party egress</FieldLabel>
            <FieldDescription>
              Allow Caps that call external services.
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </section>
  );
}
