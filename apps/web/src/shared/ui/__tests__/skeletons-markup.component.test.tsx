import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  BOARD_SKELETON_CARDS_PER_COLUMN,
  BOARD_SKELETON_COLUMN_COUNT,
  BoardSkeleton,
  BoardSkeletonLayout,
  CARD_GRID_SKELETON_SLOT_COUNT,
  COLLECT_QUEUE_SKELETON_ROW_COUNT,
  CardGridSkeleton,
  CardGridSkeletonLayout,
  CaseOverviewSkeleton,
  CaseOverviewSkeletonLayout,
  CollectDetailSkeleton,
  CollectQueueSkeleton,
  CollectQueueSkeletonLayout,
  DASHBOARD_ACTIVITY_SKELETON_ROW_COUNT,
  DASHBOARD_METRIC_TILE_COUNT,
  DashboardActivityPanelSkeleton,
  DashboardActivitySkeletonLayout,
  DashboardOverviewPanelsSkeletonLayout,
  DashboardOverviewSkeleton,
  DashboardOverviewSkeletonLayout,
  DossierConnectionsSkeletonLayout,
  DossierEvidenceSkeletonLayout,
  DossierNotesSkeletonLayout,
  DossierOverviewSkeletonLayout,
  DossierPanelSkeletonLayout,
  LoadingRegion,
  MetricTilesSkeletonLayout,
  QueueBodySkeletonLayout,
  QueueSkeleton,
  RoutePendingSkeletonLayout,
  StackBodySkeleton,
  StackBodySkeletonLayout,
  TABLE_BODY_SKELETON_ROW_COUNT,
  TASK_BOARD_COLUMN_SHELL_CLASS,
  TASK_CARD_SHELL_CLASS,
  TableBodySkeletonLayout,
} from "@/shared/ui/skeletons";

/**
 * Behaviour pin for the skeleton surface: every export is rendered with the props its
 * callers use (plus the variants that change the markup) and the HTML is compared with
 * the committed fixture. The fixture was captured from the single-file
 * `skeletons.tsx` before it was split into `skeletons/`, so a pass proves the split
 * changed no markup. Regenerate it only for a deliberate visual change:
 * `pnpm exec vitest run --project component -u <this file>`.
 */

const cases: readonly (readonly [string, () => ReactElement])[] = [
  [
    "CollectQueueSkeletonLayout default (li rows)",
    () => (
      <ul>
        <CollectQueueSkeletonLayout />
      </ul>
    ),
  ],
  [
    "CollectQueueSkeletonLayout rows=3 asListItem=false",
    () => (
      <div>
        <CollectQueueSkeletonLayout rows={3} isListItem={false} />
      </div>
    ),
  ],
  [
    "CollectQueueSkeletonLayout rows=4",
    () => (
      <ul>
        <CollectQueueSkeletonLayout rows={4} />
      </ul>
    ),
  ],
  [
    "CollectQueueSkeletonLayout rows=7",
    () => (
      <ul>
        <CollectQueueSkeletonLayout rows={7} />
      </ul>
    ),
  ],
  ["CollectQueueSkeleton default", () => <CollectQueueSkeleton />],
  [
    "CollectQueueSkeleton rows=4 className",
    () => <CollectQueueSkeleton rows={4} className="extra" />,
  ],
  ["CollectDetailSkeleton default", () => <CollectDetailSkeleton />],
  [
    "CollectDetailSkeleton className",
    () => <CollectDetailSkeleton className="extra" />,
  ],
  ["QueueBodySkeletonLayout default", () => <QueueBodySkeletonLayout />],
  [
    "QueueBodySkeletonLayout rows=2",
    () => <QueueBodySkeletonLayout rows={2} />,
  ],
  ["QueueSkeleton default", () => <QueueSkeleton />],
  [
    "QueueSkeleton rows=3 className",
    () => <QueueSkeleton rows={3} className="extra" />,
  ],
  ["CardGridSkeletonLayout default", () => <CardGridSkeletonLayout />],
  [
    "CardGridSkeletonLayout slots=2 className",
    () => <CardGridSkeletonLayout slots={2} className="extra" />,
  ],
  ["CardGridSkeleton default", () => <CardGridSkeleton />],
  [
    "CardGridSkeleton slots=3 className",
    () => <CardGridSkeleton slots={3} className="extra" />,
  ],
  ["StackBodySkeletonLayout default", () => <StackBodySkeletonLayout />],
  [
    "StackBodySkeletonLayout sections=1",
    () => <StackBodySkeletonLayout sections={1} />,
  ],
  ["StackBodySkeleton default", () => <StackBodySkeleton />],
  [
    "StackBodySkeleton sections=2 className",
    () => <StackBodySkeleton sections={2} className="extra" />,
  ],
  ["MetricTilesSkeletonLayout default", () => <MetricTilesSkeletonLayout />],
  [
    "MetricTilesSkeletonLayout count=2 className",
    () => <MetricTilesSkeletonLayout count={2} className="extra" />,
  ],
  [
    "DashboardOverviewPanelsSkeletonLayout",
    () => <DashboardOverviewPanelsSkeletonLayout />,
  ],
  [
    "DashboardOverviewSkeletonLayout",
    () => <DashboardOverviewSkeletonLayout />,
  ],
  ["DashboardOverviewSkeleton default", () => <DashboardOverviewSkeleton />],
  [
    "DashboardOverviewSkeleton className",
    () => <DashboardOverviewSkeleton className="extra" />,
  ],
  [
    "DashboardActivitySkeletonLayout default",
    () => <DashboardActivitySkeletonLayout />,
  ],
  [
    "DashboardActivitySkeletonLayout rows=2",
    () => <DashboardActivitySkeletonLayout rows={2} />,
  ],
  [
    "DashboardActivityPanelSkeleton default",
    () => <DashboardActivityPanelSkeleton />,
  ],
  [
    "DashboardActivityPanelSkeleton className",
    () => <DashboardActivityPanelSkeleton className="extra" />,
  ],
  ["CaseOverviewSkeletonLayout", () => <CaseOverviewSkeletonLayout />],
  ["CaseOverviewSkeleton default", () => <CaseOverviewSkeleton />],
  [
    "CaseOverviewSkeleton className",
    () => <CaseOverviewSkeleton className="extra" />,
  ],
  [
    "BoardSkeletonLayout default (alternating card footers)",
    () => <BoardSkeletonLayout />,
  ],
  [
    "BoardSkeletonLayout columns=2 cardsPerColumn=2",
    () => <BoardSkeletonLayout columns={2} cardsPerColumn={2} />,
  ],
  ["BoardSkeleton default", () => <BoardSkeleton />],
  [
    "BoardSkeleton columns=1 cardsPerColumn=1 className",
    () => <BoardSkeleton columns={1} cardsPerColumn={1} className="extra" />,
  ],
  [
    "TableBodySkeletonLayout default",
    () => (
      <div>
        <TableBodySkeletonLayout />
      </div>
    ),
  ],
  [
    "TableBodySkeletonLayout rows=2 columns=3",
    () => (
      <div>
        <TableBodySkeletonLayout rows={2} columns={3} />
      </div>
    ),
  ],
  ["RoutePendingSkeletonLayout", () => <RoutePendingSkeletonLayout />],
  ["DossierOverviewSkeletonLayout", () => <DossierOverviewSkeletonLayout />],
  ["DossierNotesSkeletonLayout", () => <DossierNotesSkeletonLayout />],
  [
    "DossierPanelSkeletonLayout default (list)",
    () => <DossierPanelSkeletonLayout />,
  ],
  [
    "DossierPanelSkeletonLayout variant=table",
    () => <DossierPanelSkeletonLayout variant="table" />,
  ],
  [
    "DossierPanelSkeletonLayout variant=timeline",
    () => <DossierPanelSkeletonLayout variant="timeline" />,
  ],
  [
    "DossierPanelSkeletonLayout variant=panel",
    () => <DossierPanelSkeletonLayout variant="panel" />,
  ],
  [
    "DossierConnectionsSkeletonLayout",
    () => <DossierConnectionsSkeletonLayout />,
  ],
  ["DossierEvidenceSkeletonLayout", () => <DossierEvidenceSkeletonLayout />],
  [
    "LoadingRegion",
    () => (
      <LoadingRegion label="Loading items">
        <span>placeholder</span>
      </LoadingRegion>
    ),
  ],
];

/** React-generated ids (`useId`) differ between renders; mask them. */
const normalise = (html: string) =>
  html
    .replaceAll(/(?:_r_[0-9a-z]+_|:r[0-9a-z]+:|«r[0-9a-z]+»)/g, "ID")
    .replaceAll("><", ">\n<");

const renderAll = () =>
  cases
    .map(([name, element]) => {
      const { container, unmount } = render(element());
      const html = normalise(container.innerHTML);
      unmount();
      return `### ${name}\n${html}`;
    })
    .join("\n\n");

describe("skeletons markup", () => {
  it("renders every case to non-empty markup with no leaked values", () => {
    for (const [name, element] of cases) {
      const { container, unmount } = render(element());
      expect(container.innerHTML, name).not.toBe("");
      expect(container.innerHTML, name).not.toMatch(/undefined|NaN|\[object/);
      unmount();
    }
  });

  it("renders every case without React warnings (duplicate keys and the like)", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const [, element] of cases) render(element()).unmount();
      expect(errors.mock.calls).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it("keeps the size constants and shell classes", () => {
    expect({
      TABLE_BODY_SKELETON_ROW_COUNT,
      BOARD_SKELETON_COLUMN_COUNT,
      BOARD_SKELETON_CARDS_PER_COLUMN,
      CARD_GRID_SKELETON_SLOT_COUNT,
      DASHBOARD_METRIC_TILE_COUNT,
      DASHBOARD_ACTIVITY_SKELETON_ROW_COUNT,
      COLLECT_QUEUE_SKELETON_ROW_COUNT,
    }).toEqual({
      TABLE_BODY_SKELETON_ROW_COUNT: 8,
      BOARD_SKELETON_COLUMN_COUNT: 5,
      BOARD_SKELETON_CARDS_PER_COLUMN: 3,
      CARD_GRID_SKELETON_SLOT_COUNT: 6,
      DASHBOARD_METRIC_TILE_COUNT: 6,
      DASHBOARD_ACTIVITY_SKELETON_ROW_COUNT: 5,
      COLLECT_QUEUE_SKELETON_ROW_COUNT: 10,
    });
    expect(TASK_BOARD_COLUMN_SHELL_CLASS).toEqual(expect.any(String));
    expect(TASK_CARD_SHELL_CLASS).toEqual(expect.any(String));
  });

  it("matches the pre-split markup fixture", async () => {
    await expect(renderAll()).toMatchFileSnapshot(
      "./__fixtures__/skeletons-markup.txt"
    );
  });
});
