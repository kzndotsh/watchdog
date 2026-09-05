import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge, StatusInk } from "@/shared/ui/vocab/status";
import {
  STATUS_DOT,
  STATUS_LABELS,
  statusLabel,
} from "@/shared/ui/vocab/status.lib";

describe("status vocab", () => {
  it("maps display statuses to labels and dot classes", () => {
    expect(statusLabel("running")).toBe(STATUS_LABELS.running);
    expect(STATUS_DOT.failed).toContain("status-failed");
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
