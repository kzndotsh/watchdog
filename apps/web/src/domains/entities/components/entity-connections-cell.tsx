import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownLeftIcon, ArrowUpRightIcon, PlusIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import {
  loadConnectionComposerFields,
  warmConnectionComposerFields,
} from "@/domains/entities/components/connection-composer-fields-load";
import { edgeListView } from "@/domains/entities/edges/queries";
import type { CaseEdgeRecord } from "@/domains/entities/edges/types";
import {
  connectionComposerIssues,
  type ConnectionComposerValues,
} from "@/domains/entities/lib/connection-composer";
import { edgeFromEntity } from "@/domains/entities/lib/connection-peers";
import type {
  CreateEntityConnectionInput,
  UpdateEntityConnectionInput,
} from "@/domains/entities/lib/edge-write";
import type {
  EntityListConnection,
  EntityListItem,
} from "@/domains/entities/types";
import { cn, couldnt } from "@/lib/utils";
import { useRouteCase } from "@/shared/hooks/use-route-case";
import { fullCountLabel } from "@/shared/lib/list/list-copy";
import { CHIP_SIZE_CLASS } from "@/shared/ui/chip";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { Button } from "@/shared/ui/primitives/button";
import { predicateLabel } from "@/shared/ui/vocab/edge-predicate";
import { edgeList } from "@watchdog/schemas/graph";
import {
  entityDisplayLabel,
  edgePhraseValue,
  parseEdgePhraseValue,
} from "@watchdog/schemas/shared";
import type { EdgeOrientation } from "@watchdog/schemas/shared";
import { FieldError } from "@watchdog/ui/components/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@watchdog/ui/components/popover";

// The fields (comboboxes, the peer picker) open on a click, so they load then, warmed on hover.
const LazyComposerFields = lazy(async () => {
  const { ConnectionComposerFields } = await loadConnectionComposerFields();
  return { default: ConnectionComposerFields };
});

const EMPTY_FORM: ConnectionComposerValues = {
  peerId: "",
  peerKind: null,
  phraseValue: "",
  notes: "",
};

const NO_ROWS: readonly CaseEdgeRecord[] = [];

type Props = {
  /** The row: its Connection counts, and its one Connection when it has exactly one. */
  entity: EntityListItem;
  /** The Case whose Entities the peer picker searches. */
  caseId: string;
  onCreate: (input: CreateEntityConnectionInput) => Promise<void>;
  onUpdate: (input: UpdateEntityConnectionInput) => Promise<void>;
  onDelete: (edgeId: string) => Promise<void>;
};

type PanelMode =
  | { kind: "create" }
  | { kind: "edit"; peer: EntityListConnection }
  | { kind: "browse" };

function orientationFromDirection(
  direction: EntityListConnection["direction"]
): EdgeOrientation {
  return direction === "out" ? "forward" : "inverse";
}

function formFromPeer(peer: EntityListConnection): ConnectionComposerValues {
  return {
    peerId: peer.peerId,
    peerKind: peer.peerKind,
    phraseValue: edgePhraseValue(
      peer.predicate,
      orientationFromDirection(peer.direction)
    ),
    notes: peer.notes ?? "",
  };
}

/** The one Connection, named: a click edits it. */
function SoleConnectionChip({
  peer,
  onEdit,
}: {
  peer: EntityListConnection;
  onEdit: (peer: EntityListConnection) => void;
}) {
  const peerLabel = entityDisplayLabel({
    name: peer.peerName,
    slug: peer.peerSlug,
  });
  const phrase = `${predicateLabel(peer.predicate, peer.direction)} ${peerLabel}`;
  const DirectionIcon =
    peer.direction === "out" ? ArrowUpRightIcon : ArrowDownLeftIcon;
  return (
    <button
      type="button"
      title={phrase}
      aria-label={`Edit connection ${phrase}`}
      className={cn(
        CHIP_SIZE_CLASS.sm,
        "text-foreground/80 bg-secondary hover:bg-secondary/80 inline-flex max-w-full min-w-0 shrink cursor-pointer items-center gap-1 border-transparent"
      )}
      onClick={() => {
        onEdit(peer);
      }}
    >
      <DirectionIcon
        className="text-muted-foreground size-3 shrink-0"
        aria-hidden
      />
      <span className="min-w-0 truncate">{peerLabel}</span>
    </button>
  );
}

/**
 * A row's Connections. One shows as a named chip; several collapse to direction counts so the
 * row stays on one line. Both come with the row (`connections`, `soleConnection`); the full
 * list is the Entity's own Connection read, made only while the popover lists it.
 */
export function EntityConnectionsCell({
  entity,
  caseId,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<PanelMode>({ kind: "create" });
  const [form, setForm] = useState<ConnectionComposerValues>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [unlinkingEdgeId, setUnlinkingEdgeId] = useState<string | null>(null);

  const { outgoing: outCount, incoming: inCount } = entity.connections;
  const total = outCount + inCount;
  const sole = total === 1 ? entity.soleConnection : null;
  const isCollapsed = total > 0 && sole === null;
  const isEdit = mode.kind === "edit";
  const showComposer = mode.kind === "create" || mode.kind === "edit";
  const showConnectionList = isCollapsed;
  const routeCase = useRouteCase();
  // One page of the Entity's Connections (the Connection list with `entityId` fixed: the same
  // view, and Query key, as the Dossier tab's default), read only while the popover lists them.
  // Past one page the popover links to the Dossier's Connections instead of loading more.
  const peersQuery = useInfiniteQuery({
    ...edgeListView.infinite(
      { caseId },
      edgeList.queryOf({}, { entityId: entity.id })
    ),
    enabled: isOpen && showConnectionList,
  });
  const firstPage = peersQuery.data?.pages[0];
  const peers = (firstPage?.items ?? NO_ROWS).map((row) =>
    edgeFromEntity(row, entity.id)
  );
  const morePeers =
    firstPage === undefined || firstPage.nextCursor === null
      ? null
      : fullCountLabel({
          loaded: firstPage.items.length,
          total: firstPage.total,
          hasMore: true,
          isAtCeiling: false,
          isSettled: true,
        });
  const busy = isSaving || unlinkingEdgeId !== null;

  function handleClose() {
    setIsOpen(false);
    setMode({ kind: "create" });
    setForm(EMPTY_FORM);
    setSaveError(null);
    setUnlinkingEdgeId(null);
  }

  function handleOpenCreate() {
    setMode({ kind: "create" });
    setForm(EMPTY_FORM);
    setSaveError(null);
    setIsOpen(true);
  }

  function handleEdit(peer: EntityListConnection) {
    setMode({ kind: "edit", peer });
    setForm(formFromPeer(peer));
    setSaveError(null);
    setIsOpen(true);
  }

  function handleOpenBrowse() {
    setMode({ kind: "browse" });
    setForm(EMPTY_FORM);
    setSaveError(null);
    setIsOpen(true);
  }

  async function handleUnlink(peer: EntityListConnection) {
    setUnlinkingEdgeId(peer.id);
    setSaveError(null);
    try {
      await onDelete(peer.id);
      handleClose();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : couldnt("unlink", "connection")
      );
    } finally {
      setUnlinkingEdgeId(null);
    }
  }

  async function handleSave() {
    const issue = connectionComposerIssues(form, entity.id);
    if (issue) {
      setSaveError(issue);
      return;
    }
    const parsed = parseEdgePhraseValue(form.phraseValue);
    if (!parsed) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      await (mode.kind === "edit"
        ? onUpdate({
            edgeId: mode.peer.id,
            expectedVersion: mode.peer.version,
            existingFromId: mode.peer.fromId,
            existingToId: mode.peer.toId,
            existingPeerId: mode.peer.peerId,
            peerId: form.peerId,
            predicate: parsed.predicate,
            orientation: parsed.orientation,
            notes: form.notes,
          })
        : onCreate({
            peerId: form.peerId,
            predicate: parsed.predicate,
            orientation: parsed.orientation,
            ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
          }));
      handleClose();
    } catch (error) {
      const fallback =
        mode.kind === "edit"
          ? couldnt("update", "connection")
          : couldnt("create", "connection");
      setSaveError(error instanceof Error ? error.message : fallback);
    } finally {
      setIsSaving(false);
    }
  }

  let saveLabel = "Add";
  if (isSaving) saveLabel = "Saving…";
  else if (isEdit) saveLabel = "Save";

  const addAriaLabel = `Add connection for ${entityDisplayLabel(entity)}`;

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      role="presentation"
      onPointerEnter={warmConnectionComposerFields}
      onFocus={warmConnectionComposerFields}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        // Let Escape reach Popover/Dialog dismiss; still block row-level keys.
        if (e.key === "Escape") return;
        e.stopPropagation();
      }}
    >
      <Popover
        open={isOpen}
        onOpenChange={(next) => {
          if (!next) handleClose();
        }}
        modal
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {total === 0 ? (
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    aria-label={addAriaLabel}
                    title="Add connection"
                    onClick={(e) => {
                      e.preventDefault();
                      handleOpenCreate();
                    }}
                  />
                }
              >
                <PlusIcon className="size-3" aria-hidden />
              </PopoverTrigger>
            ) : (
              <>
                {sole === null ? null : (
                  <SoleConnectionChip peer={sole} onEdit={handleEdit} />
                )}
                {isCollapsed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    aria-label={`${String(total)} connections`}
                    title={`${outCount} outgoing, ${inCount} incoming`}
                    onClick={handleOpenBrowse}
                  >
                    {outCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5">
                        <ArrowUpRightIcon
                          className="text-muted-foreground size-3"
                          aria-hidden
                        />
                        {outCount}
                      </span>
                    ) : null}
                    {inCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5">
                        <ArrowDownLeftIcon
                          className="text-muted-foreground size-3"
                          aria-hidden
                        />
                        {inCount}
                      </span>
                    ) : null}
                  </Button>
                ) : null}
              </>
            )}
          </div>

          {total > 0 ? (
            <span className="inline-flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-disabled:opacity-0">
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={addAriaLabel}
                    title="Add connection"
                    onClick={(e) => {
                      e.preventDefault();
                      handleOpenCreate();
                    }}
                  />
                }
              >
                <PlusIcon className="size-3" aria-hidden />
              </PopoverTrigger>
            </span>
          ) : null}
        </div>
        <PopoverContent align="end" className="w-80">
          {showConnectionList ? (
            <div className="flex max-h-28 flex-col gap-1 overflow-y-auto border-b pb-2">
              {peersQuery.isError ? (
                <FetchErrorAlert
                  error={couldnt("load", "connections")}
                  onRetry={() => {
                    void peersQuery.refetch();
                  }}
                />
              ) : null}
              {peersQuery.isPending ? (
                <span className="text-muted-foreground px-1 text-xs">
                  Loading connections…
                </span>
              ) : null}
              {peers.map((peer) => {
                const peerLabel = entityDisplayLabel({
                  name: peer.peerName,
                  slug: peer.peerSlug,
                });
                const selected =
                  mode.kind === "edit" && mode.peer.id === peer.id;
                return (
                  <button
                    key={peer.id}
                    type="button"
                    className={cn(
                      "hover:bg-muted/50 flex min-w-0 items-baseline gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs",
                      selected && "bg-muted/40"
                    )}
                    disabled={busy}
                    onClick={() => {
                      handleEdit(peer);
                    }}
                  >
                    <span className="text-muted-foreground shrink-0">
                      {predicateLabel(peer.predicate, peer.direction)}
                    </span>
                    <span className="truncate">{peerLabel}</span>
                  </button>
                );
              })}
              {morePeers === null ? null : (
                <span className="text-muted-foreground px-1 text-xs">
                  {morePeers}.{" "}
                  {routeCase === null ? null : (
                    <Link
                      to="/cases/$caseSlug/entities/$entitySlug"
                      params={{
                        caseSlug: routeCase.slug,
                        entitySlug: entity.slug,
                      }}
                      search={{ tab: "connections" }}
                      className="hover:text-foreground underline underline-offset-2"
                    >
                      Open all connections
                    </Link>
                  )}
                </span>
              )}
            </div>
          ) : null}

          {showComposer ? (
            <>
              <Suspense fallback={<div aria-hidden className="min-h-32" />}>
                <LazyComposerFields
                  caseId={caseId}
                  center={entity}
                  values={form}
                  onChange={setForm}
                  disabled={busy}
                />
              </Suspense>
              <FieldError>{saveError}</FieldError>
              <div className="flex items-center gap-1.5">
                {isEdit ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy}
                    aria-label={`Unlink ${entityDisplayLabel({
                      name: mode.peer.peerName,
                      slug: mode.peer.peerSlug,
                    })}`}
                    onClick={() => {
                      void handleUnlink(mode.peer);
                    }}
                  >
                    {unlinkingEdgeId === mode.peer.id ? "…" : "Unlink"}
                  </Button>
                ) : null}
                <div className="ml-auto flex gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={handleClose}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || !form.peerId || !form.phraseValue}
                    onClick={() => {
                      void handleSave();
                    }}
                  >
                    {saveLabel}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={handleOpenCreate}
            >
              <PlusIcon className="size-3" />
              Add connection
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
