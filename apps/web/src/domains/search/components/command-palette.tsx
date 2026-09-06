import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { casesContextQuery } from "@/domains/cases/queries";
import { useSearchUi } from "@/domains/search/hooks/use-search-ui";
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

const DEBOUNCE_MS = 250;

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const { paletteCommands: commandActions } = useSearchUi();

  const { data: casesCtx } = useSuspenseQuery({
    ...casesContextQuery(),
    meta: { silentError: true },
  });
  const activeCaseId = casesCtx.active?.id ?? "";
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

  const showResults = query.trim().length >= SEARCH_MIN_QUERY_LENGTH;
  const searchQuery = searchCaseQuery(activeCaseId, debouncedQuery);
  const {
    data: hits,
    isFetching,
    isPlaceholderData,
    isError,
    error,
  } = useQuery({
    ...searchQuery,
    enabled: open && showResults && searchQuery.enabled,
  });

  const switchCaseMutation = useSelectActiveCase({
    cases: casesCtx.cases,
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

  const busy = showResults && isFetching && !hits;
  const emptyMessage = (() => {
    if (busy) {
      return (
        <span className="inline-flex items-center gap-2">
          <Spinner /> Searching…
        </span>
      );
    }
    if (isError) {
      return errMessage(error, "Search failed");
    }
    if (showResults) {
      return "No results found.";
    }
    return "Type at least 2 characters to search.";
  })();

  const resultHits = showResults ? hits : null;

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
        <CommandList className={placeholderDeemphasisClass(isPlaceholderData)}>
          <CommandEmpty>{emptyMessage}</CommandEmpty>

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
              {resultHits.entities.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={`entity ${hit.name} ${hit.slug}`}
                  onSelect={() => {
                    closeThen(() => {
                      void navigate({
                        to: "/entities/$entitySlug",
                        params: { entitySlug: hit.slug },
                      });
                    });
                  }}
                >
                  <span className="truncate">{hit.name}</span>
                  <CommandShortcut>{hit.kind}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {resultHits && resultHits.identifiers.length > 0 ? (
            <CommandGroup heading="Identifiers">
              {resultHits.identifiers.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={`identifier ${hit.value} ${hit.entityName}`}
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
                  <CommandShortcut>{hit.entityName}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {resultHits && resultHits.evidence.length > 0 ? (
            <CommandGroup heading="Evidence">
              {resultHits.evidence.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={`evidence ${hit.label ?? hit.id}`}
                  onSelect={() => {
                    closeThen(() => {
                      void navigate({
                        to: "/collect",
                        search: { id: hit.id },
                      });
                    });
                  }}
                >
                  <span className="truncate">{hit.label ?? hit.kind}</span>
                  <CommandShortcut>{hit.kind}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {resultHits && resultHits.tasks.length > 0 ? (
            <CommandGroup heading="Tasks">
              {resultHits.tasks.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={`task ${hit.title}`}
                  onSelect={() => {
                    closeThen(() => {
                      void navigate({
                        to: "/tasks",
                        search: hit.entityId ? { entityId: hit.entityId } : {},
                      });
                    });
                  }}
                >
                  <span className="truncate">{hit.title}</span>
                  <CommandShortcut>{hit.status}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {resultHits && resultHits.jobs.length > 0 ? (
            <CommandGroup heading="Jobs">
              {resultHits.jobs.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={`job ${hit.capabilityId}`}
                  onSelect={() => {
                    closeThen(() => {
                      void navigate({
                        to: "/collect",
                        search: { id: hit.id },
                      });
                    });
                  }}
                >
                  <span className="truncate">{hit.capabilityId}</span>
                  <CommandShortcut>{hit.status}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {resultHits && resultHits.proposals.length > 0 ? (
            <CommandGroup heading="Triage">
              {resultHits.proposals.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={`proposal ${hit.summary ?? hit.id}`}
                  onSelect={() => {
                    closeThen(() => {
                      void navigate({
                        to: "/triage",
                        search: { proposalId: hit.id },
                      });
                    });
                  }}
                >
                  <span className="truncate">
                    {hit.summary ?? hit.capabilityId ?? "Proposal"}
                  </span>
                </CommandItem>
              ))}
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
