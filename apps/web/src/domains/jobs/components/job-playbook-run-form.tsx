import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { ListFilterIcon } from "lucide-react";
import type { SubmitEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";

import {
  PlaybookSeedFields,
  type PlaybookRunFormValues,
  type UrlDumpOption,
} from "@/domains/jobs/components/playbook-seed-fields";
import { PlaybookSelect } from "@/domains/jobs/components/playbook-select";
import { clampSelectId } from "@/domains/jobs/lib/clamp-select";
import {
  matchPlaybooks,
  PLAYBOOK_EGRESS_FILTERS,
  playbookEgressFilterLabel,
  playbookSeedFilterLabel,
  playbookSeedFilterOptions,
} from "@/domains/jobs/lib/playbook-match";
import { buildPlaybookSeedView } from "@/domains/jobs/lib/playbook-seed-view";
import type { PlaybookListItem } from "@/domains/jobs/types";
import { cn } from "@/lib/utils";
import {
  PageFilterMenu,
  type PageFilterChip,
} from "@/shared/layout/page-filter-menu";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { FieldSelect } from "@/shared/ui/field-select";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { Button } from "@/shared/ui/shadcn/button";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import { Label } from "@/shared/ui/shadcn/label";
import { WithTooltip } from "@/shared/ui/timestamp";

export interface PlaybookRunVars {
  playbookId: string;
  host: string;
  url: string;
  evidenceId: string;
  entityId: string;
  ip: string;
  email: string;
  hash: string;
  handle: string;
}

interface JobPlaybookRunFormProps {
  playbooks: PlaybookListItem[];
  /** Intake URL dumps — picking one fills evidenceId + url. */
  urlDumps: UrlDumpOption[];
  entities: EntityOption[];
  allowThirdPartyEgress: boolean;
  configuredCredentials: ReadonlySet<string>;
  runError?: string | null;
  onRunPlaybook: (vars: PlaybookRunVars) => Promise<void>;
  layout?: "inline" | "stacked";
}

export function JobPlaybookRunForm({
  playbooks,
  urlDumps,
  entities,
  allowThirdPartyEgress,
  configuredCredentials,
  runError,
  onRunPlaybook,
  layout = "inline",
}: JobPlaybookRunFormProps) {
  const needsKeyOnlyId = useId();
  const urlDumpOnlyId = useId();
  const [seedFilter, setSeedFilter] = useState("");
  const [egressFilter, setEgressFilter] = useState("");
  const [needsKeyOnly, setNeedsKeyOnly] = useState(false);
  const [urlDumpOnly, setUrlDumpOnly] = useState(false);

  const seedOptions = useMemo(
    () => playbookSeedFilterOptions(playbooks),
    [playbooks]
  );
  const visiblePlaybooks = useMemo(
    () =>
      matchPlaybooks(playbooks, {
        seedFilter,
        egressFilter,
        needsKeyOnly,
        urlDumpOnly,
      }),
    [playbooks, seedFilter, egressFilter, needsKeyOnly, urlDumpOnly]
  );
  const filterChips: PageFilterChip[] = useMemo(() => {
    const chips: PageFilterChip[] = [];
    if (seedFilter) {
      chips.push({
        id: "seed",
        label: playbookSeedFilterLabel(seedFilter),
        onClear: () => {
          setSeedFilter("");
        },
      });
    }
    if (egressFilter) {
      chips.push({
        id: "egress",
        label: playbookEgressFilterLabel(egressFilter),
        onClear: () => {
          setEgressFilter("");
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
    if (urlDumpOnly) {
      chips.push({
        id: "urlDump",
        label: "URL dump",
        onClear: () => {
          setUrlDumpOnly(false);
        },
      });
    }
    return chips;
  }, [seedFilter, egressFilter, needsKeyOnly, urlDumpOnly]);

  const form = useForm({
    defaultValues: {
      playbookId: playbooks[0]?.id ?? "host-footprint",
      host: "",
      url: "",
      evidenceId: "",
      entityId: "",
      ip: "",
      email: "",
      hash: "",
      handle: "",
    } satisfies PlaybookRunFormValues,
    onSubmit: async ({ value }) => {
      try {
        await onRunPlaybook(value);
        form.reset({
          playbookId: value.playbookId,
          host: "",
          url: "",
          evidenceId: "",
          entityId: "",
          ip: "",
          email: "",
          hash: "",
          handle: "",
        });
      } catch {
        // Parent sets runError via onRunPlaybook.
      }
    },
  });

  useEffect(() => {
    const current = form.getFieldValue("playbookId");
    const next = clampSelectId(
      current,
      visiblePlaybooks.map((p) => p.id)
    );
    if (next !== null && next !== current) {
      form.setFieldValue("playbookId", next);
    }
  }, [visiblePlaybooks, form]);

  function clearPlaybookFilters() {
    setSeedFilter("");
    setEgressFilter("");
    setNeedsKeyOnly(false);
    setUrlDumpOnly(false);
  }

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
        aria-label="Run playbook"
      >
        <form.Subscribe
          selector={(state) => ({
            playbookId: state.values.playbookId,
            host: state.values.host,
            url: state.values.url,
            evidenceId: state.values.evidenceId,
            ip: state.values.ip,
            email: state.values.email,
            hash: state.values.hash,
            handle: state.values.handle,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({
            playbookId,
            host,
            url,
            evidenceId,
            ip,
            email,
            hash,
            handle,
            isSubmitting,
          }) => {
            const view = buildPlaybookSeedView({
              playbooks,
              playbookId,
              host,
              url,
              evidenceId,
              ip,
              email,
              hash,
              handle,
              urlDumpCount: urlDumps.length,
              allowThirdPartyEgress,
              configuredCredentials,
            });

            return (
              <>
                <div className="flex w-full min-w-0 items-center gap-0.5">
                  <div className="min-w-0 flex-1">
                    <form.Field name="playbookId">
                      {(field) => (
                        <PlaybookSelect
                          playbooks={visiblePlaybooks}
                          value={field.state.value}
                          onValueChange={(id) => {
                            field.handleChange(id);
                          }}
                          disabled={visiblePlaybooks.length === 0}
                          needsEgress={view.needsEgress}
                          allowThirdPartyEgress={allowThirdPartyEgress}
                        />
                      )}
                    </form.Field>
                  </div>
                  <PageFilterMenu
                    chips={filterChips}
                    onClearAll={clearPlaybookFilters}
                    align="end"
                    contentClassName="w-[16rem]"
                    icon={ListFilterIcon}
                    label="Playbook filters"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="playbook-filter-seed">Seed</Label>
                      <FieldSelect
                        id="playbook-filter-seed"
                        className="w-full"
                        value={seedFilter}
                        onValueChange={setSeedFilter}
                        aria-label="Filter playbooks by seed"
                        options={seedOptions}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="playbook-filter-egress">Egress</Label>
                      <FieldSelect
                        id="playbook-filter-egress"
                        className="w-full"
                        value={egressFilter}
                        onValueChange={setEgressFilter}
                        aria-label="Filter playbooks by egress"
                        options={PLAYBOOK_EGRESS_FILTERS.map((opt) => ({
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
                    <label
                      htmlFor={urlDumpOnlyId}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={urlDumpOnlyId}
                        checked={urlDumpOnly}
                        onCheckedChange={(value) => {
                          setUrlDumpOnly(value);
                        }}
                      />
                      URL dump seed
                    </label>
                  </PageFilterMenu>
                </div>
                <PlaybookSeedFields
                  layout={layout}
                  view={view}
                  urlDumps={urlDumps}
                  entities={entities}
                  form={form}
                />
                <div
                  className={
                    layout === "stacked" ? "flex w-full justify-end" : undefined
                  }
                >
                  <WithTooltip
                    wrapSpan={!view.canRun}
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
                        view.blockedReason
                      )
                    }
                  >
                    <Button
                      type="submit"
                      size="sm"
                      className="h-8 text-xs"
                      loading={isSubmitting}
                      disabled={!view.canRun || isSubmitting}
                    >
                      Run Playbook
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
