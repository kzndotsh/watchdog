import { useMemo } from "react";

import type { ConnectionComposerValues } from "@/domains/entities/lib/connection-composer";
import { entityPickerPort } from "@/domains/entities/queries";
import type { EntityOption } from "@/shared/ui/entity-combobox";
import { FieldCombobox } from "@/shared/ui/field-combobox";
import { SearchedEntityCombobox } from "@/shared/ui/searched-entity-combobox";
import {
  ANY_KIND_PEERS,
  clampEdgePhrase,
  edgePhraseOptionsForPeers,
  peerKindAllowedForPhrase,
  preferredEdgePhrase,
} from "@/shared/ui/vocab/edge-predicate";
import {
  edgePhraseValue,
  ENTITY_KINDS,
  parseEdgePhraseValue,
  parseOptionalTrimmedUuid,
} from "@watchdog/schemas/shared";
import type { EntityKind } from "@watchdog/schemas/shared";
import { Field, FieldGroup, FieldLabel } from "@watchdog/ui/components/field";
import { Input } from "@watchdog/ui/components/input";

type Props = {
  /** The Case whose Entities the peer picker searches (one small page, #559). */
  caseId: string;
  /** The Entity the Connection starts from: never offered as its own peer. */
  center: { id: string; kind: EntityKind };
  values: ConnectionComposerValues;
  onChange: (next: ConnectionComposerValues) => void;
  disabled?: boolean;
};

/** The kinds a peer may have for the chosen relationship; none (no filter) when any kind may. */
function peerKindsForPhrase(
  centerKind: EntityKind,
  phraseValue: string
): readonly EntityKind[] {
  const parsed = parseEdgePhraseValue(phraseValue);
  if (!parsed) return [];
  const allowed = ENTITY_KINDS.filter((kind) =>
    peerKindAllowedForPhrase(
      centerKind,
      kind,
      parsed.predicate,
      parsed.orientation
    )
  );
  return allowed.length === ENTITY_KINDS.length ? [] : allowed;
}

/** The relationship to keep (or pick) once a peer of `peerKind` is chosen. */
function phraseForPeer(
  centerKind: EntityKind,
  peerKind: EntityKind,
  phraseValue: string
): string {
  const parsed = parseEdgePhraseValue(phraseValue);
  if (parsed) {
    const clamped = clampEdgePhrase(
      centerKind,
      peerKind,
      parsed.predicate,
      parsed.orientation
    );
    return edgePhraseValue(clamped.predicate, clamped.orientation);
  }
  return preferredEdgePhrase(centerKind, peerKind)?.value ?? "";
}

function ignorePeerId(): void {
  // The peer is set from the picked record in `onEntityChange`.
}

/**
 * Compact relationship + peer + related_to notes fields, for the Entities table's Connections
 * popover (the Dossier keeps its full dialog). The peer picker searches the Case's Entities on
 * the server, narrowed to the kinds the chosen relationship allows.
 */
export function ConnectionComposerFields({
  caseId,
  center,
  values,
  onChange,
  disabled = false,
}: Props) {
  const phraseOptions = edgePhraseOptionsForPeers(
    center.kind,
    ANY_KIND_PEERS,
    values.peerKind ?? undefined
  );
  const peerPort = useMemo(
    () =>
      entityPickerPort(caseId, {
        kinds: peerKindsForPhrase(center.kind, values.phraseValue),
      }),
    [caseId, center.kind, values.phraseValue]
  );
  const excludeIds = useMemo(() => [center.id], [center.id]);
  const isNotesNeeded =
    parseEdgePhraseValue(values.phraseValue)?.predicate === "related_to";

  function handleSetPhrase(phraseValue: string) {
    const parsed = parseEdgePhraseValue(phraseValue);
    const peerStillValid =
      parsed === null ||
      values.peerKind === null ||
      peerKindAllowedForPhrase(
        center.kind,
        values.peerKind,
        parsed.predicate,
        parsed.orientation
      );
    onChange(
      peerStillValid
        ? { ...values, phraseValue }
        : { ...values, phraseValue, peerId: "", peerKind: null }
    );
  }

  function handleSetPeer(peer: EntityOption | null) {
    const peerId = parseOptionalTrimmedUuid(peer?.id ?? "") ?? "";
    if (peer?.kind === undefined || peerId === "") {
      onChange({ ...values, peerId, peerKind: null, phraseValue: "" });
      return;
    }
    onChange({
      ...values,
      peerId,
      peerKind: peer.kind,
      phraseValue: phraseForPeer(center.kind, peer.kind, values.phraseValue),
    });
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel>Relationship</FieldLabel>
        <FieldCombobox
          value={values.phraseValue}
          onValueChange={handleSetPhrase}
          options={phraseOptions}
          placeholder="Search relationships…"
          emptyText="No matching relationships."
          disabled={disabled}
          className="w-full"
          aria-label="Connection relationship"
        />
      </Field>

      <Field>
        <FieldLabel>Peer</FieldLabel>
        <SearchedEntityCombobox
          port={peerPort}
          excludeIds={excludeIds}
          value={values.peerId}
          // The picked record (`onEntityChange`) carries the kind the relationship needs.
          onValueChange={ignorePeerId}
          onEntityChange={handleSetPeer}
          shouldAllowEmpty={false}
          emptyLabel="Select peer…"
          size="sm"
          className="w-full flex-none"
          aria-label="Connection peer"
          disabled={disabled}
        />
      </Field>

      {isNotesNeeded ? (
        <Field>
          <FieldLabel htmlFor="connection-notes">Notes</FieldLabel>
          <Input
            id="connection-notes"
            value={values.notes}
            onChange={(e) => {
              onChange({ ...values, notes: e.target.value });
            }}
            placeholder="Why related…"
            disabled={disabled}
          />
        </Field>
      ) : null}
    </FieldGroup>
  );
}
