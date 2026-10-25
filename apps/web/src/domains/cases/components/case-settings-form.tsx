import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useUpdateCase } from "@/domains/cases/hooks/use-update-case";
import { deletionPolicyQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { useUnsavedGuard } from "@/shared/hooks/use-unsaved-guard";
import { FormSection } from "@/shared/ui/form-section";
import { UnsavedChangesDialog } from "@/shared/ui/unsaved-changes-dialog";
import {
  egressClassDescription,
  egressClassLabel,
  normalizeAllowedEgress,
} from "@watchdog/schemas/caps";
import { EGRESS_CLASSES } from "@watchdog/schemas/shared";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";
import { Switch } from "@watchdog/ui/components/switch";
import { Textarea } from "@watchdog/ui/components/textarea";

/** The classes a Case can switch: `local` is always allowed, so it has no switch. */
const CASE_EGRESS_TOGGLES = EGRESS_CLASSES.filter((c) => c !== "local");

type CaseSettingsFormProps = {
  caseId: string;
  caseRow: CaseRecord;
};

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
  // The egress switch is an owner or admin decision (the API refuses anyone else): members see
  // it, read only.
  const { data: policy } = useQuery(deletionPolicyQuery());
  const canChangeEgress = policy?.canManage === true;

  // Drafts save on blur. Unsaved means differing from what the Case holds, or from what a
  // save in flight is writing: a later edit, or a save that fails, still counts.
  const saving = updateMutation.isPending
    ? updateMutation.variables
    : undefined;
  const isDirty =
    nameDraft.trim() !== (saving?.name ?? serverName).trim() ||
    descriptionDraft.trim() !==
      (saving?.description ?? serverDescription).trim();
  const guard = useUnsavedGuard(isDirty);

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
        <div className="flex flex-col gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <FieldLabel>Allowed egress</FieldLabel>
            <FieldDescription>
              Where Caps on this Case may send the seed. A step that needs a
              class that is off stays blocked.
              {policy !== undefined && !canChangeEgress
                ? " Only an owner or admin can change this."
                : ""}
            </FieldDescription>
          </div>
          {CASE_EGRESS_TOGGLES.map((egressClass) => {
            const isAllowed = caseRow.allowedEgress.includes(egressClass);
            return (
              <div
                key={egressClass}
                className="flex items-center justify-between gap-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <FieldLabel htmlFor={`case-egress-${egressClass}`}>
                    {egressClassLabel(egressClass)}
                  </FieldLabel>
                  <FieldDescription>
                    {egressClassDescription(egressClass)}
                  </FieldDescription>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground text-xs" aria-hidden>
                    {isAllowed ? "On" : "Off"}
                  </span>
                  <Switch
                    id={`case-egress-${egressClass}`}
                    checked={isAllowed}
                    // Each switch saves the whole set from the saved row: a second change before
                    // the first lands would drop it.
                    disabled={!canChangeEgress || updateMutation.isPending}
                    onCheckedChange={(checked) => {
                      updateMutation.mutate({
                        allowedEgress: normalizeAllowedEgress(
                          checked
                            ? [...caseRow.allowedEgress, egressClass]
                            : caseRow.allowedEgress.filter(
                                (c) => c !== egressClass
                              )
                        ),
                      });
                    }}
                  />
                </span>
              </div>
            );
          })}
        </div>
      </FieldGroup>
      <UnsavedChangesDialog guard={guard} subject="your edits to this Case" />
    </FormSection>
  );
}
