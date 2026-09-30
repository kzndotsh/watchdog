import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge, StatusInk } from "@/shared/ui/vocab/status";
import {
  STATUS_DOT,
  STATUS_GLYPH,
  STATUS_LABELS,
  statusLabel,
} from "@/shared/ui/vocab/status.lib";

describe("status vocab", () => {
  it("maps display statuses to labels and dot classes", () => {
    expect(statusLabel("running")).toBe(STATUS_LABELS.running);
    expect(STATUS_DOT.failed).toContain("status-failed");
    expect(STATUS_DOT.blocked).toBe("bg-warning");
    expect(STATUS_DOT.queued).not.toBe(STATUS_DOT.running);
  });

  it("gives same-hue statuses distinct glyphs", () => {
    const sameHue: (keyof typeof STATUS_GLYPH)[][] = [
      ["queued", "cancelled", "unknown", "retracted"],
      ["pending", "contested", "former"],
      ["succeeded", "current"],
      ["failed", "rejected"],
    ];
    for (const group of sameHue) {
      const icons = new Set(group.map((s) => STATUS_GLYPH[s].icon));
      expect(icons.size).toBe(group.length);
    }
  });

  it("renders status badge copy", () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders status ink as a word, not a chip", () => {
    render(<StatusInk status="pending">unprocessed</StatusInk>);
    expect(screen.getByText("unprocessed")).toBeInTheDocument();
  });
});
