import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { WORK_TO } from "@/config/nav";
import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import { useSelectActiveCase } from "@/domains/cases/hooks/use-select-active-case";
import { useSearchUi } from "@/domains/search/hooks/use-search-ui";
import {
  searchEvidenceHitLabel,
  searchJobHitLabel,
  searchProposalHitLabel,
} from "@/domains/search/lib/hit-labels";
import { jumpNavItems } from "@/domains/search/lib/jump-nav";
import { searchCaseQuery } from "@/domains/search/queries";
import { couldnt } from "@/lib/utils";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { useRegisteredPaletteCommands } from "@/shared/hooks/use-registered-palette-commands";
import { actionChord, type AppAction } from "@/shared/lib/app-action";
import { SEARCH_DEBOUNCE_MS } from "@/shared/lib/debounce";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { queryLoadError } from "@/shared/lib/query-load-error";
import {
  ActionShortcutChord,
  MENU_KBD_CLASS,
} from "@/shared/ui/action-shortcut-chord";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import {
  statusLabel,
  taskPriorityLabel,
  taskStatusLabel,
} from "@/shared/ui/vocab";
import { kindLabel } from "@/shared/ui/vocab/kind.lib";
import {
  SEARCH_MIN_QUERY_LENGTH,
  type SearchCaseResult,
} from "@watchdog/schemas/cases";
import { entityDisplayLabel } from "@watchdog/schemas/shared";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@watchdog/ui/components/command";
import { Spinner } from "@watchdog/ui/components/spinner";

function taskHitShortcut(hit: {
  status: SearchCaseResult["tasks"][number]["status"];
  priority: SearchCaseResult["tasks"][number]["priority"];
  entityName: string | null;
}): string {
  const status = taskStatusLabel(hit.status);
  const priority =
    hit.priority === null ? null : taskPriorityLabel(hit.priority);
  if (hit.entityName) {
    return priority === null
      ? hit.entityName
      : `${hit.entityName} · ${priority}`;
  }
  return priority === null ? status : `${status} · ${priority}`;
}

type PaletteActionGroupProps = {
  heading: string;
  actions: readonly AppAction[];
  onRun: (run: () => void) => void;
};

/** Separated group of AppAction commands (hidden when empty). */
function PaletteActionGroup({
  heading,
  actions,
  onRun,
}: PaletteActionGroupProps) {
  if (actions.length === 0) return null;
  return (
    <>
      <CommandSeparator />
      <CommandGroup heading={heading}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <CommandItem
              key={action.id}
              value={`command ${action.label} ${action.keywords ?? ""}`}
              disabled={action.disabled}
              onSelect={() => {
                onRun(() => {
                  action.run();
                });
              }}
            >
              {Icon ? <Icon /> : null}
              <span>{action.label}</span>
              {actionChord(action) ? (
                <CommandShortcut>
                  <ActionShortcutChord
                    chord={actionChord(action) ?? ""}
                    kbdClassName={MENU_KBD_CLASS}
                  />
                </CommandShortcut>
              ) : null}
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { paletteCommands: commandActions } = useSearchUi();
  const pageActions = useRegisteredPaletteCommands();

  const {
    cases,
    active: activeCase,
    loadError: casesLoadError,
    retry: retryCases,
  } = useCasesContext({ silentError: true });
  const activeCaseId = activeCase?.id ?? "";
  // Search hits exist only with an Active Case, so the slug is set whenever one is opened.
  const caseSlug = activeCase?.slug ?? "";
  // Work screens need a Case to name in the URL.
  const jumpItems = jumpNavItems().filter(
    (item) => item.screen === undefined || caseSlug !== ""
  );

  const trimmed = query.trim();
  const term = trimmed.length >= SEARCH_MIN_QUERY_LENGTH ? trimmed : "";
  const { value: debouncedQuery } = useDebouncedValue(
    term,
    term === "" ? 0 : SEARCH_DEBOUNCE_MS,
    ""
  );

  const isQueryReady = query.trim().length >= SEARCH_MIN_QUERY_LENGTH;
  // Below the minimum the last settled term stays for a tick; hide its results at once.
  const debouncedReady =
    isQueryReady && debouncedQuery.trim().length >= SEARCH_MIN_QUERY_LENGTH;
  const pendingDebounce =
    isQueryReady && query.trim() !== debouncedQuery.trim();
  const showResults = debouncedReady && activeCaseId.length > 0;
  const searchQuery = searchCaseQuery(activeCaseId, debouncedQuery);
  const {
    data: hits,
    isFetching,
    isPlaceholderData,
    isError,
    error,
    refetch,
  } = useQuery({
    ...searchQuery,
    enabled: open && debouncedReady && searchQuery.enabled,
  });

  const switchCaseMutation = useSelectActiveCase({
    cases,
    navigate,
    shouldNavigateToOverview: true,
  });

  function handleOpenChange(isNextOpen: boolean) {
    if (!isNextOpen) {
      setQuery("");
    }
    onOpenChange(isNextOpen);
  }

  function handleCloseThen(run: () => void) {
    handleOpenChange(false);
    run();
  }

  function selectCase(hit: SearchCaseResult["cases"][number]) {
    handleOpenChange(false);
    if (hit.id === activeCaseId) {
      void navigate({
        to: "/cases/$caseSlug",
        params: { caseSlug: hit.slug },
      });
      return;
    }
    switchCaseMutation.mutate(hit.id);
  }

  const busy = showResults && (pendingDebounce || (isFetching && !hits));
  const emptyMessage = (() => {
    if (busy) {
      return (
        <span className="inline-flex items-center gap-2">
          <Spinner /> Searching…
        </span>
      );
    }
    if (debouncedReady && activeCaseId.length === 0) {
      return "Select an active case to search.";
    }
    if (showResults) {
      return "No results found.";
    }
    return `Type at least ${SEARCH_MIN_QUERY_LENGTH} characters to search.`;
  })();

  const resultHits = showResults && !isError ? hits : null;
  const searchLoadError = showResults
    ? queryLoadError(
        { isError, isFetching, error },
        pendingDebounce,
        couldnt("run", "search")
      )
    : null;
  const paletteLoadError = casesLoadError ?? searchLoadError;
  const handleRetryPaletteLoad = () => {
    if (casesLoadError) {
      retryCases();
      return;
    }
    if (showResults && isError) {
      void refetch();
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Search Watchdog"
      description="Search the Active Case or jump to a page"
      className="sm:max-w-lg"
    >
      <Command shouldFilter={!showResults}>
        <CommandInput
          placeholder="Search entities, evidence, tasks…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList
          className={placeholderDeemphasisClass(isPlaceholderData && !isError)}
        >
          {paletteLoadError ? (
            <div className="px-3 py-2">
              <FetchErrorAlert
                error={paletteLoadError}
                onRetry={handleRetryPaletteLoad}
              />
            </div>
          ) : (
            <CommandEmpty>{emptyMessage}</CommandEmpty>
          )}

          {showResults ? null : (
            <>
              <CommandGroup heading="Jump to">
                {jumpItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.screen ?? item.to}
                      value={`jump ${item.label}`}
                      onSelect={() => {
                        handleCloseThen(() => {
                          if (item.screen === undefined) {
                            void navigate({ to: item.to });
                            return;
                          }
                          void navigate({
                            to: WORK_TO[item.screen],
                            params: { caseSlug },
                          });
                        });
                      }}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <PaletteActionGroup
                heading="This Page"
                actions={pageActions}
                onRun={handleCloseThen}
              />
              <PaletteActionGroup
                heading="Commands"
                actions={commandActions}
                onRun={handleCloseThen}
              />
            </>
          )}

          {resultHits && resultHits.entities.length > 0 ? (
            <CommandGroup heading="Entities">
              {resultHits.entities.map((hit) => {
                const label = entityDisplayLabel(hit);
                return (
                  <CommandItem
                    key={hit.id}
                    value={`entity ${label} ${hit.slug}`}
                    onSelect={() => {
                      handleCloseThen(() => {
                        void navigate({
                          to: "/cases/$caseSlug/entities/$entitySlug",
                          params: { caseSlug, entitySlug: hit.slug },
                        });
                      });
                    }}
                  >
                    <span className="truncate">{label}</span>
                    <CommandShortcut>{kindLabel(hit.kind)}</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {resultHits && resultHits.identifiers.length > 0 ? (
            <CommandGroup heading="Identifiers">
              {resultHits.identifiers.map((hit) => {
                const entityLabel = entityDisplayLabel({
                  name: hit.entityName,
                  slug: hit.entitySlug,
                });
                return (
                  <CommandItem
                    key={hit.id}
                    value={`identifier ${hit.value} ${entityLabel} ${hit.entitySlug}`}
                    onSelect={() => {
                      handleCloseThen(() => {
                        void navigate({
                          to: "/cases/$caseSlug/entities/$entitySlug",
                          params: { caseSlug, entitySlug: hit.entitySlug },
                          search: { tab: "identifiers" },
                        });
                      });
                    }}
                  >
                    <span className="truncate">{hit.value}</span>
                    <CommandShortcut>
                      {[kindLabel(hit.type), entityLabel]
                        .filter(Boolean)
                        .join(" · ")}
                    </CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {resultHits && resultHits.evidence.length > 0 ? (
            <CommandGroup heading="Evidence">
              {resultHits.evidence.map((hit) => {
                const label = searchEvidenceHitLabel(hit);
                return (
                  <CommandItem
                    key={hit.id}
                    value={`evidence ${label} ${hit.entityName ?? ""}`}
                    onSelect={() => {
                      handleCloseThen(() => {
                        void navigate({
                          to: "/cases/$caseSlug/collect",
                          params: { caseSlug },
                          search: { id: hit.id },
                        });
                      });
                    }}
                  >
                    <span className="truncate">{label}</span>
                    <CommandShortcut>
                      {hit.entityName ?? kindLabel(hit.kind)}
                    </CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {resultHits && resultHits.tasks.length > 0 ? (
            <CommandGroup heading="Tasks">
              {resultHits.tasks.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={`task ${hit.title} ${hit.entityName ?? ""}`}
                  onSelect={() => {
                    handleCloseThen(() => {
                      void navigate({
                        to: "/cases/$caseSlug/tasks",
                        params: { caseSlug },
                        search: {
                          ...(hit.entityId ? { entityId: hit.entityId } : {}),
                          taskId: hit.id,
                        },
                      });
                    });
                  }}
                >
                  <span className="truncate">{hit.title}</span>
                  <CommandShortcut>{taskHitShortcut(hit)}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {resultHits && resultHits.jobs.length > 0 ? (
            <CommandGroup heading="Jobs">
              {resultHits.jobs.map((hit) => {
                const label = searchJobHitLabel(
                  hit,
                  resultHits.evidenceLabels,
                  resultHits.entityLabels
                );
                return (
                  <CommandItem
                    key={hit.id}
                    value={`job ${label} ${hit.playbookId ?? hit.capabilityId}`}
                    onSelect={() => {
                      handleCloseThen(() => {
                        void navigate({
                          to: "/cases/$caseSlug/collect",
                          params: { caseSlug },
                          search: { id: hit.id },
                        });
                      });
                    }}
                  >
                    <span className="truncate">{label}</span>
                    <CommandShortcut>{statusLabel(hit.status)}</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {resultHits && resultHits.proposals.length > 0 ? (
            <CommandGroup heading="Triage">
              {resultHits.proposals.map((hit) => {
                const label = searchProposalHitLabel(hit);
                return (
                  <CommandItem
                    key={hit.id}
                    value={`proposal ${label} ${hit.playbookId ?? hit.capabilityId ?? hit.id}`}
                    onSelect={() => {
                      handleCloseThen(() => {
                        void navigate({
                          to: "/cases/$caseSlug/triage",
                          params: { caseSlug },
                          search: { proposalId: hit.id },
                        });
                      });
                    }}
                  >
                    <span className="truncate">{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {resultHits && resultHits.cases.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Cases">
                {resultHits.cases.map((hit) => (
                  <CommandItem
                    key={hit.id}
                    value={`case ${hit.name} ${hit.slug}`}
                    onSelect={() => {
                      selectCase(hit);
                    }}
                  >
                    <span className="truncate">{hit.name}</span>
                    {hit.id === activeCaseId ? (
                      <CommandShortcut>Active</CommandShortcut>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
