import { capEgressLabel } from "@/shared/ui/vocab/cap-egress.lib";
import { titleCase } from "@/shared/ui/vocab/title-case";

import type { CapListItem } from "../types";
import { formatCapCredentials, formatCapIo } from "./cap-run-input";

export interface CapInfoRow {
  label: string;
  value: string;
  mono?: boolean;
}

interface CapInfoField {
  label: string;
  read: (cap: CapListItem) => string;
  mono?: boolean;
}

const CAP_INFO_FIELDS: CapInfoField[] = [
  { label: "Kind", read: (cap) => (cap.kind ? titleCase(cap.kind) : "") },
  { label: "Source", read: (cap) => cap.dataSource ?? "" },
  { label: "Consumes", read: (cap) => formatCapIo(cap.consumes) ?? "" },
  { label: "Produces", read: (cap) => formatCapIo(cap.produces) ?? "" },
  {
    label: "Secrets",
    read: (cap) => formatCapCredentials(cap.credentials) ?? "",
    mono: true,
  },
];

function pushInfoRow(
  rows: CapInfoRow[],
  label: string,
  value: string,
  mono = false
): void {
  if (value === "") return;
  rows.push({ label, value, mono });
}

function pushUseCaseRow(rows: CapInfoRow[], useCases: readonly string[]): void {
  if (useCases.length === 0) return;
  rows.push({ label: "Intent", value: useCases.join(", ") });
}

function pushFlagRow(rows: CapInfoRow[], flags: readonly string[]): void {
  if (flags.length === 0) return;
  rows.push({
    label: "Flags",
    value: flags.map((flag) => titleCase(flag)).join(", "),
  });
}

function pushEgressRow(rows: CapInfoRow[], cap: CapListItem): void {
  if ((cap.egress ?? "none") !== "third_party") return;
  rows.push({ label: "Egress", value: capEgressLabel(cap.egress) });
}

/** Cap detail rows for hover card / picker preview panel. */
export function capInfoRows(cap: CapListItem): CapInfoRow[] {
  const rows: CapInfoRow[] = [];

  for (const field of CAP_INFO_FIELDS) {
    pushInfoRow(rows, field.label, field.read(cap), field.mono);
  }
  pushUseCaseRow(rows, cap.useCases ?? []);
  pushFlagRow(rows, cap.flags ?? []);
  pushEgressRow(rows, cap);

  return rows;
}
