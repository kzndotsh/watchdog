import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import { useSearchUi } from "@/domains/search/hooks/use-search-ui";
import {
  searchEvidenceHitLabel,
  searchJobHitLabel,
  searchProposalHitLabel,
} from "@/domains/search/lib/hit-labels";
import { jumpNavItems } from "@/domains/search/lib/jump-nav";
import { searchCaseQuery } from "@/domains/search/queries";
import {
  SEARCH_MIN_QUERY_LENGTH,
  type SearchCaseResult,
} from "@/domains/search/types";
import { errMessage } from "@/lib/utils";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { useSelectActiveCase } from "@/shared/lib/use-select-active-case";
import { ActionShortcutChord, MENU_KBD_CLASS } from "@/shared/ui/action-list";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
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
} from "@/shared/ui/shadcn/command";
import { Spinner } from "@/shared/ui/shadcn/spinner";
import {
  statusLabel,
  taskPriorityLabel,
  taskStatusLabel,
} from "@/shared/ui/vocab";
import { kindLabel } from "@/shared/ui/vocab/kind.lib";
import { entityDisplayLabel } from "@watchdog/schemas";

const DEBOUNCE_MS = 250;

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

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { paletteCommands: commandActions } = useSearchUi();

  const {
    cases,
    active: activeCase,
    loadError: casesLoadError,
    retry: retryCases,
  } = useCasesContext({ silentError: true });
  const activeCaseId = activeCase?.id ?? "";
  const jumpItems = jumpNavItems();

  useEffect(() => {
    const trimmed = query.trim();
    const delay = trimmed.length >= SEARCH_MIN_QUERY_LENGTH ? DEBOUNCE_MS : 0;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(
        trimmed.length >= SEARCH_MIN_QUERY_LENGTH ? trimmed : ""
      );
    }, delay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  const queryReady = query.trim().length >= SEARCH_MIN_QUERY_LENGTH;
  const debouncedReady =
    debouncedQuery.trim().length >= SEARCH_MIN_QUERY_LENGTH;
  const pendingDebounce = queryReady && query.trim() !== debouncedQuery.trim();
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
    navigateToOverview: true,
  });

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("");
      setDebouncedQuery("");
    }
    onOpenChange(next);
  }

  function closeThen(run: () => void) {
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
    return "Type at least 2 characters to search.";
  })();

  const resultHits = showResults && !isError ? hits : null;
  const paletteLoadError =
    casesLoadError ??
    (showResults && isError ? errMessage(error, "Search failed") : null);
  const retryPaletteLoad = () => {
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
                onRetry={retryPaletteLoad}
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
                      key={item.to}
                      value={`jump ${item.label}`}
                      onSelect={() => {
                        closeThen(() => {
                          void navigate({ to: item.to });
                        });
                      }}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {commandActions.length > 0 ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Commands">
                    {commandActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <CommandItem
                          key={action.id}
                          value={`command ${action.label} ${action.keywords ?? ""}`}
                          disabled={action.disabled}
                          onSelect={() => {
                            closeThen(() => {
                              action.run();
                            });
                          }}
                        >
                          {Icon ? <Icon /> : null}
                          <span>{action.label}</span>
                          {action.shortcut ? (
                            <CommandShortcut className="tracking-normal">
                              <ActionShortcutChord
                                chord={action.shortcut}
                                kbdClassName={MENU_KBD_CLASS}
                              />
                            </CommandShortcut>
                          ) : null}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              ) : null}
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
                      closeThen(() => {
                        void navigate({
                          to: "/entities/$entitySlug",
                          params: { entitySlug: hit.slug },
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
                      closeThen(() => {
                        void navigate({
                          to: "/entities/$entitySlug",
                          params: { entitySlug: hit.entitySlug },
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
                      closeThen(() => {
                        void navigate({
                          to: "/collect",
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
                    closeThen(() => {
                      void navigate({
                        to: "/tasks",
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
                      closeThen(() => {
                        void navigate({
                          to: "/collect",
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
                      closeThen(() => {
                        void navigate({
                          to: "/triage",
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
