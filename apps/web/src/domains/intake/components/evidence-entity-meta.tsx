import { Link } from "@tanstack/react-router";
import { PencilIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { EntityCombobox, type EntityOption } from "@/shared/ui/entity-combobox";
import { Button } from "@/shared/ui/primitives/button";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import {
  entityDisplayLabel,
  parseOptionalTrimmedUuid,
} from "@watchdog/schemas/shared";

function attachedEntityLabel(opts: {
  attachedId: string;
  entityName?: string | null;
  entities?: readonly EntityOption[];
}): string {
  const scopedAttachedId = parseOptionalTrimmedUuid(opts.attachedId);
  if (scopedAttachedId === undefined) return "Unattached";
  const entity = opts.entities?.find((ent) => ent.id === scopedAttachedId);
  if (entity !== undefined) {
    return entityDisplayLabel({
      name: entity.name,
      slug: entity.slug ?? "",
    });
  }
  const name = opts.entityName?.trim();
  if (name !== undefined && name !== "") return name;
  return "Unknown entity";
}

type EvidenceEntityEditorProps = {
  attachedId: string;
  entities: readonly EntityOption[];
  isAttaching: boolean;
  onAttachEntity: (entityId: string) => void;
  onClose: () => void;
};

function EvidenceEntityEditor({
  attachedId,
  entities,
  isAttaching,
  onAttachEntity,
  onClose,
}: EvidenceEntityEditorProps) {
  const editorRef = useRef<HTMLSpanElement>(null);

  function handleEntityChange(next: string) {
    onClose();
    if (next === attachedId) return;
    onAttachEntity(next);
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (editorRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-slot=combobox-content]")
      ) {
        return;
      }
      onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <span ref={editorRef} className="inline-flex items-center">
      <EntityCombobox
        entities={entities}
        value={attachedId}
        onValueChange={handleEntityChange}
        emptyLabel="Unattached"
        aria-label="Attach to entity"
        disabled={isAttaching}
        autoFocus
        shouldShowClear={false}
        className="h-6 w-44 [&_[data-slot=input-group-addon]]:mr-0 [&_[data-slot=input-group-control]]:h-6"
      />
    </span>
  );
}

type EvidenceEntityMetaProps = {
  entityName?: string | null;
  attachedId: string;
  entities?: readonly EntityOption[];
  isAttaching: boolean;
  isHidden: boolean;
  onAttachEntity?: (entityId: string) => void;
};

export function EvidenceEntityMeta({
  entityName,
  attachedId,
  entities,
  isAttaching,
  isHidden,
  onAttachEntity,
}: EvidenceEntityMetaProps) {
  const [isEditing, setIsEditing] = useState(false);
  const label = attachedEntityLabel({
    attachedId,
    entityName,
    entities,
  });
  const canEdit =
    !isHidden && onAttachEntity !== undefined && entities !== undefined;

  function handleStartEdit() {
    setIsEditing(true);
  }

  const handleCloseEditor = useCallback(() => {
    setIsEditing(false);
  }, []);

  const scopedAttachedId = parseOptionalTrimmedUuid(attachedId);
  const slug =
    scopedAttachedId === undefined
      ? undefined
      : entities?.find((ent) => ent.id === scopedAttachedId)?.slug;
  const nameClass =
    scopedAttachedId === undefined
      ? "text-muted-foreground"
      : "text-foreground/80";
  const nameEl =
    slug !== undefined && slug !== "" ? (
      <Link
        to="/entities/$entitySlug"
        params={{ entitySlug: slug }}
        className="text-foreground/80 hover:text-foreground underline-offset-2 hover:underline"
      >
        {label}
      </Link>
    ) : (
      <span className={nameClass}>{label}</span>
    );

  if (!canEdit || entities === undefined || onAttachEntity === undefined) {
    return nameEl;
  }

  if (isEditing) {
    return (
      <EvidenceEntityEditor
        attachedId={attachedId}
        entities={entities}
        isAttaching={isAttaching}
        onAttachEntity={onAttachEntity}
        onClose={handleCloseEditor}
      />
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-0.5">
      {nameEl}
      <WithTooltip content="Change entity" shouldWrapSpan>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="-mr-1.5"
          aria-label="Change entity"
          disabled={isAttaching}
          onClick={handleStartEdit}
        >
          <PencilIcon className="size-3" aria-hidden />
        </Button>
      </WithTooltip>
    </span>
  );
}
