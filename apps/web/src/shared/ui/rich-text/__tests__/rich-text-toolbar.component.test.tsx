import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("platejs", () => ({
  KEYS: {
    h1: "h1",
    h2: "h2",
    h3: "h3",
    bold: "bold",
    italic: "italic",
    underline: "underline",
    ul: "ul",
    ol: "ol",
  },
}));

vi.mock("platejs/react", () => ({
  useEditorRef: () => ({
    tf: {
      toggleBlock: vi.fn(),
      toggleMark: vi.fn(),
    },
  }),
  useEditorSelector: () => false,
}));

import { RichTextToolbar } from "@/shared/ui/rich-text/rich-text-toolbar";

describe("RichTextToolbar", () => {
  it("renders formatting controls", () => {
    render(<RichTextToolbar />);
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Heading 1" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Bulleted list" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Numbered list" })
    ).toBeInTheDocument();
  });
});
