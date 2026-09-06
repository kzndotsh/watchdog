import { render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/ui/shadcn/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({
    children,
    render,
  }: {
    children: ReactNode;
    render?: ReactElement;
  }) => <div>{render ? cloneElement(render, {}, children) : children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="menu-content">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuShortcut: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));

import { entityRowActions } from "@/domains/entities/lib/entity-row-actions";
import type { EntityRecord } from "@/domains/entities/types";
import { RowActionsMenu } from "@/shared/ui/row-actions-menu";
import { testId } from "@watchdog/test-kit";

const ENTITY: EntityRecord = {
  id: testId(1),
  caseId: testId(2),
  slug: "alice",
  name: "Alice",
  kind: "person",
  summary: null,
  notes: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("RowActionsMenu + entityRowActions", () => {
  it("renders shared factory labels in the ⋯ menu", () => {
    const handlers = {
      onOpenEntity: vi.fn(),
      onCopyEntityLink: vi.fn(),
      onCopyEntityMarkdown: vi.fn(),
      onDeleteEntity: vi.fn(),
    };
    render(
      <RowActionsMenu
        label={`Actions for ${ENTITY.name}`}
        actions={entityRowActions(ENTITY, handlers)}
      />
    );

    expect(
      screen.getByRole("button", { name: `Actions for ${ENTITY.name}` })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Open entity/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Copy link/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Copy Markdown/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete/ })).toBeInTheDocument();
  });
});
