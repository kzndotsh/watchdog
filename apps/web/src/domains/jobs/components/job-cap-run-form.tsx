import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { ListFilterIcon } from "lucide-react";
import type { SubmitEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";

import { CapCapabilitySelect } from "@/domains/jobs/components/cap-capability-select";
import {
  categoryFilterOptions,
  detectPasteSeed,
  matchCaps,
  USE_CASE_FILTERS,
} from "@/domains/jobs/lib/cap-match";
import { buildCapRunView } from "@/domains/jobs/lib/cap-run-view";
import { clampSelectId } from "@/domains/jobs/lib/clamp-select";
import type { CapListItem } from "@/domains/jobs/types";
import { cn } from "@/lib/utils";
import {
  PageFilterMenu,
  type PageFilterChip,
} from "@/shared/layout/page-filter-menu";
import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import { FieldSelect } from "@/shared/ui/field-select";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { Button } from "@/shared/ui/shadcn/button";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { WithTooltip } from "@/shared/ui/timestamp";

const KIND_FILTERS = [
  { value: "", label: "All kinds" },
  { value: "collect", label: "Collect" },
  { value: "enrich", label: "Enrich" },
  { value: "process", label: "Process" },
  { value: "act", label: "Act" },
] as const;

interface CapRunFormValues {
  capabilityId: string;
  runInput: string;
  entityId: string;
}

export interface CapRunVars {
  capabilityId: string;
  runInput: string;
  entityId: string;
}

interface JobCapRunFormProps {
  caps: CapListItem[];
  entities: EntityOption[];
  allowThirdPartyEgress: boolean;
  configuredCredentials: ReadonlySet<string>;
  runError?: string | null;
  onRunCap: (vars: CapRunVars) => Promise<void>;
  layout?: "inline" | "stacked";
}

export function JobCapRunForm({
  caps,
  entities,
  allowThirdPartyEgress,
  configuredCredentials,
  runError,
  onRunCap,
  layout = "inline",
}: JobCapRunFormProps) {
  const needsKeyOnlyId = useId();
  const [kindFilter, setKindFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [useCaseFilter, setUseCaseFilter] = useState("");
  const [needsKeyOnly, setNeedsKeyOnly] = useState(false);

  const categoryOptions = useMemo(() => categoryFilterOptions(caps), [caps]);

  // CapMatch seed = the same field used to Run (paste host / URL / Evidence).
  const [runInputLive, setRunInputLive] = useState("");

  const form = useForm({
    defaultValues: {
      capabilityId: "",
      runInput: "",
      entityId: "",
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

  const visibleCaps = useMemo(
    () =>
      matchCaps(caps, {
        kindFilter,
        categoryFilter,
        useCaseFilter,
        needsKeyOnly,
        paste,
      }),
    [caps, kindFilter, categoryFilter, useCaseFilter, needsKeyOnly, paste]
  );

  const filterChips: PageFilterChip[] = useMemo(() => {
    const chips: PageFilterChip[] = [];
    if (kindFilter) {
      chips.push({
        id: "kind",
        label:
          KIND_FILTERS.find((k) => k.value === kindFilter)?.label ?? kindFilter,
        onClear: () => {
          setKindFilter("");
        },
      });
    }
    if (categoryFilter) {
      chips.push({
        id: "category",
        label:
          categoryOptions.find((c) => c.value === categoryFilter)?.label ??
          categoryFilter,
        onClear: () => {
          setCategoryFilter("");
        },
      });
    }
    if (useCaseFilter) {
      chips.push({
        id: "useCase",
        label: useCaseFilter,
        onClear: () => {
          setUseCaseFilter("");
        },
      });
    }
    if (needsKeyOnly) {
      chips.push({
        id: "needsKey",
        label: "Needs key",
        onClear: () => {
          setNeedsKeyOnly(false);
        },
      });
    }
    return chips;
  }, [
    kindFilter,
    categoryFilter,
    useCaseFilter,
    needsKeyOnly,
    categoryOptions,
  ]);

  useEffect(() => {
    const current = form.getFieldValue("capabilityId");
    const next = clampSelectId(
      current,
      visibleCaps.map((c) => c.id),
      { allowEmpty: true }
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

  function clearCapFilters() {
    setKindFilter("");
    setCategoryFilter("");
    setUseCaseFilter("");
    setNeedsKeyOnly(false);
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
              allowThirdPartyEgress,
              configuredCredentials,
            });
            const seedHint =
              paste && paste.kind !== "unknown"
                ? `Matched ${paste.kind}${paste.hostHint ? ` · ${paste.hostHint}` : ""}`
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
                          needsEgress={view.needsEgress}
                        />
                      )}
                    </form.Field>
                  </div>
                  <PageFilterMenu
                    chips={filterChips}
                    onClearAll={clearCapFilters}
                    align="end"
                    contentClassName="w-[16rem]"
                    icon={ListFilterIcon}
                    label="Cap filters"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="cap-filter-kind">Kind</Label>
                      <FieldSelect
                        id="cap-filter-kind"
                        className="w-full"
                        value={kindFilter}
                        onValueChange={setKindFilter}
                        aria-label="Filter Caps by kind"
                        options={KIND_FILTERS.map((opt) => ({
                          value: opt.value,
                          label: opt.label,
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cap-filter-category">Category</Label>
                      <FieldSelect
                        id="cap-filter-category"
                        className="w-full"
                        value={categoryFilter}
                        onValueChange={setCategoryFilter}
                        aria-label="Filter Caps by category"
                        options={categoryOptions}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cap-filter-intent">Intent</Label>
                      <FieldSelect
                        id="cap-filter-intent"
                        className="w-full"
                        value={useCaseFilter}
                        onValueChange={setUseCaseFilter}
                        aria-label="Filter Caps by intent"
                        options={USE_CASE_FILTERS.map((opt) => ({
                          value: opt.value,
                          label: opt.label,
                        }))}
                      />
                    </div>
                    <label
                      htmlFor={needsKeyOnlyId}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={needsKeyOnlyId}
                        checked={needsKeyOnly}
                        onCheckedChange={(value) => {
                          setNeedsKeyOnly(value);
                        }}
                      />
                      Needs key
                    </label>
                  </PageFilterMenu>
                </div>
                {layout === "stacked" ? (
                  <div className="grid w-full grid-cols-2 gap-2">
                    <form.Field name="runInput">
                      {(runField) => (
                        <Input
                          className="h-8 w-full text-xs"
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
                          wrapSpan
                          content={
                            entityField.state.value === ""
                              ? "No Entity — captures Evidence only (no Triage Proposal)."
                              : null
                          }
                        >
                          <EntityCombobox
                            entities={entities}
                            value={entityField.state.value}
                            onValueChange={(id) => {
                              entityField.handleChange(id);
                            }}
                            emptyLabel="No entity"
                            aria-label="Attach to entity"
                            hideWhenEmpty
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
                          className="h-8 min-w-[12rem] flex-1 text-xs sm:max-w-xs"
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
                          wrapSpan
                          content={
                            entityField.state.value === ""
                              ? "No Entity — captures Evidence only (no Triage Proposal)."
                              : null
                          }
                        >
                          <EntityCombobox
                            entities={entities}
                            value={entityField.state.value}
                            onValueChange={(id) => {
                              entityField.handleChange(id);
                            }}
                            emptyLabel="No entity"
                            aria-label="Attach to entity"
                            hideWhenEmpty
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
                    wrapSpan={!view.canRun || view.showEvidenceOnlyHint}
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
                        (view.showEvidenceOnlyHint
                          ? "Runs without Entity — Evidence only, no Triage Proposal."
                          : null))
                      )
                    }
                  >
                    <Button
                      type="submit"
                      size="sm"
                      className="h-8 text-xs"
                      loading={isSubmitting}
                      disabled={
                        !view.canRun || visibleCaps.length === 0 || isSubmitting
                      }
                    >
                      Run Capability
                    </Button>
                  </WithTooltip>
                </div>
              </>
            );
          }}
        </form.Subscribe>
      </form>
      <FormInlineError className="max-w-md text-right">
        {runError}
      </FormInlineError>
    </div>
  );
}
