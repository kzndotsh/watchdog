import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import type { SubmitEvent } from "react";
import { useEffect } from "react";

import { EgressBlockNotice } from "@/domains/cases/components/egress-block-notice";
import type { CaseEgress } from "@/domains/cases/types";
import {
  PlaybookSeedFields,
  type PlaybookRunFormValues,
  type UrlDumpOption,
} from "@/domains/jobs/components/playbook-seed-fields";
import { PlaybookSelect } from "@/domains/jobs/components/playbook-select";
import { usePlaybookRunFilters } from "@/domains/jobs/hooks/use-playbook-run-filters";
import { clampSelectId } from "@/domains/jobs/lib/clamp-select";
import { buildPlaybookSeedView } from "@/domains/jobs/lib/playbook-seed-view";
import type { PlaybookListItem } from "@/domains/jobs/types";
import { cn } from "@/lib/utils";
import type { PickerPort } from "@/shared/hooks/use-picker-source";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { ListFilterChips, ListFiltersButton } from "@/shared/ui/list";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import { FieldError } from "@watchdog/ui/components/field";

/** The Playbook filters have no `ref` or `tags` filter, so they need no option source. */
const NO_SOURCES = {};

export type PlaybookRunVars = {
  playbookId: string;
  host: string;
  url: string;
  evidenceId: string;
  entityId: string;
  ip: string;
  email: string;
  hash: string;
  handle: string;
};

type JobPlaybookRunFormProps = {
  playbooks: PlaybookListItem[];
  /** Intake URL dumps — picking one fills evidenceId + url. */
  urlDumps: UrlDumpOption[];
  entityPort: PickerPort<EntityOption>;
  caseEgress: CaseEgress;
  configuredCredentials: ReadonlySet<string>;
  runError?: string | null;
  onRunPlaybook: (vars: PlaybookRunVars) => Promise<void>;
  layout?: "inline" | "stacked";
  /** The Playbook the form starts on (a Library link); the first one otherwise. */
  initialPlaybookId?: string;
};

export function JobPlaybookRunForm({
  playbooks,
  urlDumps,
  entityPort,
  caseEgress,
  configuredCredentials,
  runError,
  onRunPlaybook,
  layout = "inline",
  initialPlaybookId,
}: JobPlaybookRunFormProps) {
  const { list, filtersButtonRef, visiblePlaybooks } =
    usePlaybookRunFilters(playbooks);

  const form = useForm({
    defaultValues: {
      playbookId:
        playbooks.find((p) => p.id === initialPlaybookId)?.id ??
        playbooks[0]?.id ??
        "",
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
      visiblePlaybooks.map((p) => p.id),
      { shouldAllowEmpty: true }
    );
    if (next !== null && next !== current) {
      form.setFieldValue("playbookId", next);
    }
  }, [visiblePlaybooks, form]);

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
              allowedEgress: caseEgress.allowedEgress,
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
                          isEgressNeeded={view.egressBlock !== undefined}
                          allowedEgress={caseEgress.allowedEgress}
                        />
                      )}
                    </form.Field>
                  </div>
                  <ListFiltersButton
                    list={list}
                    sources={NO_SOURCES}
                    triggerRef={filtersButtonRef}
                  />
                </div>
                <ListFilterChips
                  list={list}
                  sources={NO_SOURCES}
                  filtersButtonRef={filtersButtonRef}
                />
                <PlaybookSeedFields
                  layout={layout}
                  view={view}
                  urlDumps={urlDumps}
                  entityPort={entityPort}
                  form={form}
                />
                <div
                  className={
                    layout === "stacked" ? "flex w-full justify-end" : undefined
                  }
                >
                  <WithTooltip
                    shouldWrapSpan={!view.canRun}
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
                      size="lg"
                      loading={isSubmitting}
                      disabled={!view.canRun || isSubmitting}
                    >
                      Run Playbook
                    </Button>
                  </WithTooltip>
                </div>
                {view.egressBlock === undefined ? null : (
                  <div className="w-full">
                    <EgressBlockNotice
                      caseEgress={caseEgress}
                      block={view.egressBlock}
                      subject="playbook"
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
