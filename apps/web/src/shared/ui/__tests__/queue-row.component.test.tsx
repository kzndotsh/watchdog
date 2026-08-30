import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  QueueRow,
  QueueRowInstantMeta,
  QueueRowMeta,
  QueueRowTitle,
} from "@/shared/ui/queue-row";

describe("QueueRow", () => {
  it("renders row chrome and instant meta helpers", () => {
    render(
      <QueueRow
        selected
        live
        leading={<span>L</span>}
        trailing={<span>T</span>}
      >
        <QueueRowTitle>Job run</QueueRowTitle>
        <QueueRowMeta>Queued</QueueRowMeta>
      </QueueRow>
    );

    const row = screen.getByRole("option");
    expect(row).toHaveAttribute("data-selected");
    expect(row).toHaveAttribute("data-live");
    expect(screen.getByText("Job run")).toBeInTheDocument();
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });

  it("renders clock, relative time, and id chip meta", () => {
    render(
      <QueueRowInstantMeta
        value="2026-01-15T12:00:00.000Z"
        id="8680fa38-0c1d-4e2f-9a3b-595335c1d2e3"
      />
    );

    expect(screen.getByText(/8680fa38/)).toBeInTheDocument();
  });
});
