import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import type { SubmitEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { EgressBlockNotice } from "@/domains/cases/components/egress-block-notice";
import type { CaseEgress } from "@/domains/cases/types";
import { CapCapabilitySelect } from "@/domains/jobs/components/cap-capability-select";
import { useCapRunFilters } from "@/domains/jobs/hooks/use-cap-run-filters";
import { detectPasteSeed } from "@/domains/jobs/lib/cap-match";
import type { CapRunPrefill } from "@/domains/jobs/lib/cap-run-input";
import { buildCapRunView } from "@/domains/jobs/lib/cap-run-view";
import { clampSelectId } from "@/domains/jobs/lib/clamp-select";
import type { CapListItem } from "@/domains/jobs/types";
import { cn } from "@/lib/utils";
import type { PickerPort } from "@/shared/hooks/use-picker-source";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { ListFilterChips, ListFiltersButton } from "@/shared/ui/list";
import { Button } from "@/shared/ui/primitives/button";
import { SearchedEntityCombobox } from "@/shared/ui/searched-entity-combobox";
import { kindLabel } from "@/shared/ui/vocab/kind.lib";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import { FieldError } from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";

type CapRunFormValues = {
  capabilityId: string;
  runInput: string;
  entityId: string;
};

export type CapRunVars = {
  capabilityId: string;
  runInput: string;
  entityId: string;
};

type JobCapRunFormProps = {
  caps: CapListItem[];
  entityPort: PickerPort<EntityOption>;
  caseEgress: CaseEgress;
  configuredCredentials: ReadonlySet<string>;
  runError?: string | null;
  onRunCap: (vars: CapRunVars) => Promise<void>;
  /** Values the form opens with; remount (change `key`) to apply a new one. */
  prefill?: CapRunPrefill;
  layout?: "inline" | "stacked";
};

export function JobCapRunForm({
  caps,
  entityPort,
  caseEgress,
  configuredCredentials,
  runError,
  onRunCap,
  prefill,
  layout = "inline",
}: JobCapRunFormProps) {
  // CapMatch seed = the same field used to Run (paste host / URL / Evidence).
  const [runInputLive, setRunInputLive] = useState(prefill?.runInput ?? "");

  const form = useForm({
    defaultValues: {
      capabilityId: prefill?.capabilityId ?? "",
      runInput: prefill?.runInput ?? "",
      entityId: prefill?.entityId ?? "",
    } satisfies CapRunFormValues,
    onSubmit: async ({ value }) => {
      try {
        await onRunCap(value);
        form.reset({
          capabilityId: value.capabilityId,
          runInput: "",
          entityId: "",
        });
        setRunInputLive("");
      } catch {
        // Parent sets runError via onRunCap.
      }
    },
  });

  const paste = useMemo(
    () => (runInputLive.trim() ? detectPasteSeed(runInputLive) : null),
    [runInputLive]
  );

  const { list, sources, filtersButtonRef, visibleCaps } = useCapRunFilters(
    caps,
    { paste, prefillCapId: prefill?.capabilityId }
  );

  useEffect(() => {
    const current = form.getFieldValue("capabilityId");
    const next = clampSelectId(
      current,
      visibleCaps.map((c) => c.id),
      { shouldAllowEmpty: true }
    );
    if (next !== null && next !== current) {
      form.setFieldValue("capabilityId", next);
    }
  }, [visibleCaps, form]);

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    e.stopPropagation();
    void form.handleSubmit();
  }

  return (
    <div
      className={cn(
        "flex max-w-full min-w-0 flex-col gap-1",
        layout === "stacked" ? "items-stretch" : "items-end"
      )}
    >
      <form
        className={cn(
          layout === "stacked"
            ? "flex w-full min-w-0 flex-col gap-2"
            : "flex min-w-0 flex-wrap items-center justify-end gap-2"
        )}
        onSubmit={handleSubmit}
        aria-label="Run capability"
      >
        <form.Subscribe
          selector={(state) => ({
            capabilityId: state.values.capabilityId,
            runInput: state.values.runInput,
            entityId: state.values.entityId,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ capabilityId, runInput, entityId, isSubmitting }) => {
            const view = buildCapRunView({
              caps: visibleCaps,
              capabilityId,
              runInput,
              entityId,
              allowedEgress: caseEgress.allowedEgress,
              configuredCredentials,
            });
            const seedHint =
              paste && paste.kind !== "unknown"
                ? `Matched ${kindLabel(paste.kind)}${paste.hostHint ? ` · ${paste.hostHint}` : ""}`
                : undefined;

            return (
              <>
                <div className="flex w-full min-w-0 items-center gap-0.5">
                  <div className="min-w-0 flex-1">
                    <form.Field name="capabilityId">
                      {(capField) => (
                        <CapCapabilitySelect
                          caps={visibleCaps}
                          value={capField.state.value}
                          onValueChange={(id) => {
                            capField.handleChange(id);
                          }}
                          disabled={visibleCaps.length === 0}
                          isEgressNeeded={view.egressBlock !== undefined}
                        />
                      )}
                    </form.Field>
                  </div>
                  <ListFiltersButton
                    list={list}
                    sources={sources}
                    triggerRef={filtersButtonRef}
                  />
                </div>
                <ListFilterChips
                  list={list}
                  sources={sources}
                  filtersButtonRef={filtersButtonRef}
                />
                {layout === "stacked" ? (
                  <div className="grid w-full grid-cols-2 gap-2">
                    <form.Field name="runInput">
                      {(runField) => (
                        <Input
                          className="h-8 w-full"
                          placeholder={view.primaryField.placeholder}
                          value={runField.state.value}
                          onBlur={runField.handleBlur}
                          onChange={(e) => {
                            const next = e.target.value;
                            runField.handleChange(next);
                            setRunInputLive(next);
                          }}
                          aria-label={`Capability ${view.primaryField.key}`}
                          title={seedHint}
                        />
                      )}
                    </form.Field>
                    <form.Field name="entityId">
                      {(entityField) => (
                        <WithTooltip
                          side="bottom"
                          shouldWrapSpan
                          content={
                            entityField.state.value === ""
                              ? "No Entity — captures Evidence only (no Triage Proposal)."
                              : null
                          }
                        >
                          <SearchedEntityCombobox
                            port={entityPort}
                            value={entityField.state.value}
                            onValueChange={(id) => {
                              entityField.handleChange(id);
                            }}
                            emptyLabel="No entity"
                            aria-label="Attach to entity"
                            shouldHideWhenEmpty
                            className="w-full"
                          />
                        </WithTooltip>
                      )}
                    </form.Field>
                  </div>
                ) : (
                  <>
                    <form.Field name="runInput">
                      {(runField) => (
                        <Input
                          className="h-8 min-w-[12rem] flex-1 sm:max-w-xs"
                          placeholder={view.primaryField.placeholder}
                          value={runField.state.value}
                          onBlur={runField.handleBlur}
                          onChange={(e) => {
                            const next = e.target.value;
                            runField.handleChange(next);
                            setRunInputLive(next);
                          }}
                          aria-label={`Capability ${view.primaryField.key}`}
                          title={seedHint}
                        />
                      )}
                    </form.Field>
                    <form.Field name="entityId">
                      {(entityField) => (
                        <WithTooltip
                          side="bottom"
                          shouldWrapSpan
                          content={
                            entityField.state.value === ""
                              ? "No Entity — captures Evidence only (no Triage Proposal)."
                              : null
                          }
                        >
                          <SearchedEntityCombobox
                            port={entityPort}
                            value={entityField.state.value}
                            onValueChange={(id) => {
                              entityField.handleChange(id);
                            }}
                            emptyLabel="No entity"
                            aria-label="Attach to entity"
                            shouldHideWhenEmpty
                          />
                        </WithTooltip>
                      )}
                    </form.Field>
                  </>
                )}
                <div
                  className={
                    layout === "stacked" ? "flex w-full justify-end" : undefined
                  }
                >
                  <WithTooltip
                    shouldWrapSpan={
                      !view.canRun || view.shouldShowEvidenceOnlyHint
                    }
                    content={
                      view.missingCredentials !== undefined &&
                      view.blockedReason !== undefined ? (
                        <>
                          {view.blockedReason}{" "}
                          <Link
                            to="/settings"
                            search={{ tab: "credentials" }}
                            className="underline underline-offset-2"
                          >
                            Open Settings
                          </Link>
                        </>
                      ) : (
                        (view.blockedReason ??
                        (view.shouldShowEvidenceOnlyHint
                          ? "Runs without Entity — Evidence only, no Triage Proposal."
                          : null))
                      )
                    }
                  >
                    <Button
                      type="submit"
                      size="lg"
                      loading={isSubmitting}
                      disabled={
                        !view.canRun || visibleCaps.length === 0 || isSubmitting
                      }
                    >
                      Run Capability
                    </Button>
                  </WithTooltip>
                </div>
                {view.egressBlock === undefined ? null : (
                  <div className="w-full">
                    <EgressBlockNotice
                      caseEgress={caseEgress}
                      block={view.egressBlock}
                      subject="Cap"
                    />
                  </div>
                )}
              </>
            );
          }}
        </form.Subscribe>
      </form>
      <FieldError className="max-w-md text-right">{runError}</FieldError>
    </div>
  );
}
