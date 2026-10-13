import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocalDateTime } from "@/shared/ui/local-date-time";

describe("LocalDateTime", () => {
  it("renders an em dash for empty values", () => {
    render(<LocalDateTime value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("formats a timestamp for display", () => {
    render(<LocalDateTime value="2026-01-15T12:00:00.000Z" isDateOnly />);
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
