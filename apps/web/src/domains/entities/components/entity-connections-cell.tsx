import { ArrowDownLeftIcon, ArrowUpRightIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { ConnectionComposerFields } from "@/domains/entities/components/connection-composer-fields";
import {
  connectionComposerIssues,
  type ConnectionComposerValues,
} from "@/domains/entities/lib/connection-composer";
import type { EntityConnectionPeer } from "@/domains/entities/lib/connection-peers";
import type {
  CreateEntityConnectionInput,
  UpdateEntityConnectionInput,
} from "@/domains/entities/lib/edge-write";
import type { EntityRecord } from "@/domains/entities/types";
import { cn } from "@/lib/utils";
import { CHIP_SIZE_CLASS } from "@/shared/ui/detail-status-chip";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { Button } from "@/shared/ui/shadcn/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/shadcn/popover";
import {
  edgePhraseValue,
  parseEdgePhraseValue,
  predicateLabel,
} from "@/shared/ui/vocab/edge-predicate";
import type { EdgeOrientation } from "@watchdog/schemas";

const MAX_VISIBLE_CHIPS = 2;

const DASHED_PILL_CLASS =
  "text-muted-foreground hover:text-foreground border-border/60 hover:bg-muted/40 h-5 gap-0.5 rounded-full border border-dashed bg-transparent px-1.5 text-xs font-normal shadow-none";

const EMPTY_FORM: ConnectionComposerValues = {
  peerId: "",
  phraseValue: "",
  notes: "",
};

interface Props {
  entity: EntityRecord;
  peers: readonly EntityConnectionPeer[];
  entityOptions: readonly EntityOption[];
  onCreate: (input: CreateEntityConnectionInput) => Promise<void>;
  onUpdate: (input: UpdateEntityConnectionInput) => Promise<void>;
}

type PanelMode =
  | { kind: "create" }
  | { kind: "edit"; peer: EntityConnectionPeer }
  | { kind: "browse" };

function orientationFromDirection(
  direction: EntityConnectionPeer["direction"]
): EdgeOrientation {
  return direction === "out" ? "forward" : "inverse";
}

function formFromPeer(peer: EntityConnectionPeer): ConnectionComposerValues {
  return {
    peerId: peer.peerId,
    phraseValue: edgePhraseValue(
      peer.predicate,
      orientationFromDirection(peer.direction)
    ),
    notes: peer.notes ?? "",
  };
}

export function EntityConnectionsCell({
  entity,
  peers,
  entityOptions,
  onCreate,
  onUpdate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PanelMode>({ kind: "create" });
  const [form, setForm] = useState<ConnectionComposerValues>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const peerChoices = entityOptions.filter((o) => o.id !== entity.id);
  const visible = peers.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = peers.length - visible.length;
  const addDisabled = peerChoices.length === 0;
  const isEdit = mode.kind === "edit";
  const showComposer = mode.kind === "create" || mode.kind === "edit";

  function close() {
    setOpen(false);
    setMode({ kind: "create" });
    setForm(EMPTY_FORM);
    setSaveError(null);
  }

  function openCreate() {
    setMode({ kind: "create" });
    setForm(EMPTY_FORM);
    setSaveError(null);
    setOpen(true);
  }

  function openEdit(peer: EntityConnectionPeer) {
    setMode({ kind: "edit", peer });
    setForm(formFromPeer(peer));
    setSaveError(null);
    setOpen(true);
  }

  function openBrowse() {
    setMode({ kind: "browse" });
    setForm(EMPTY_FORM);
    setSaveError(null);
    setOpen(true);
  }

  async function handleSave() {
    const issue = connectionComposerIssues(form);
    if (issue) {
      setSaveError(issue);
      return;
    }
    const parsed = parseEdgePhraseValue(form.phraseValue);
    if (!parsed) return;

    setSaving(true);
    setSaveError(null);
    try {
      await (mode.kind === "edit"
        ? onUpdate({
            edgeId: mode.peer.edgeId,
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
      close();
    } catch (error) {
      const fallback =
        mode.kind === "edit"
          ? "Couldn't update connection"
          : "Couldn't create connection";
      setSaveError(error instanceof Error ? error.message : fallback);
    } finally {
      setSaving(false);
    }
  }

  let saveLabel = "Add";
  if (saving) saveLabel = "Saving…";
  else if (isEdit) saveLabel = "Save";

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        // Let Escape reach Popover/Dialog dismiss; still block row-level keys.
        if (e.key === "Escape") return;
        e.stopPropagation();
      }}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {peers.length === 0 ? (
          <span className="text-muted-foreground text-xs">—</span>
        ) : (
          <>
            {visible.map((peer) => {
              const label = predicateLabel(peer.predicate, peer.direction);
              const phrase = `${label} ${peer.peerName}`;
              const DirectionIcon =
                peer.direction === "out" ? ArrowUpRightIcon : ArrowDownLeftIcon;
              return (
                <button
                  key={peer.edgeId}
                  type="button"
                  title={phrase}
                  aria-label={`Edit connection ${phrase}`}
                  className={cn(
                    CHIP_SIZE_CLASS.sm,
                    "text-foreground/80 bg-secondary hover:bg-secondary/80 inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1 border-transparent"
                  )}
                  onClick={() => {
                    openEdit(peer);
                  }}
                >
                  <DirectionIcon
                    className="text-muted-foreground size-3 shrink-0"
                    aria-hidden
                  />
                  <span className="min-w-0 truncate font-medium">
                    {peer.peerName}
                  </span>
                </button>
              );
            })}
            {overflow > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={DASHED_PILL_CLASS}
                aria-label={`${overflow} more connections`}
                onClick={openBrowse}
              >
                +{overflow}
              </Button>
            ) : null}
          </>
        )}
      </div>

      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        modal
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground size-6 shrink-0 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
              disabled={addDisabled}
              aria-label={`Add connection for ${entity.name}`}
              title="Add connection"
              onClick={(e) => {
                e.preventDefault();
                openCreate();
              }}
            />
          }
        >
          <PlusIcon className="size-3" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 gap-2.5">
          {peers.length > 0 && (mode.kind === "browse" || overflow > 0) ? (
            <div className="flex max-h-28 flex-col gap-1 overflow-y-auto border-b pb-2">
              {peers.map((peer) => (
                <button
                  key={peer.edgeId}
                  type="button"
                  className="hover:bg-muted/50 flex min-w-0 items-baseline gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs"
                  onClick={() => {
                    openEdit(peer);
                  }}
                >
                  <span className="text-muted-foreground shrink-0">
                    {predicateLabel(peer.predicate, peer.direction)}
                  </span>
                  <span className="truncate font-medium">{peer.peerName}</span>
                </button>
              ))}
            </div>
          ) : null}

          {showComposer ? (
            <>
              <ConnectionComposerFields
                centerKind={entity.kind}
                peerOptions={peerChoices}
                values={form}
                onChange={setForm}
                disabled={saving}
              />
              <FormInlineError>{saveError}</FormInlineError>
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={close}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving || !form.peerId || !form.phraseValue}
                  onClick={() => {
                    void handleSave();
                  }}
                >
                  {saveLabel}
                </Button>
              </div>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={addDisabled}
              onClick={openCreate}
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
