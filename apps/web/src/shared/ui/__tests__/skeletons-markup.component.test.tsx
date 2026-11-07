import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  BoardSkeleton,
  BoardSkeletonLayout,
  CardGridSkeleton,
  CardGridSkeletonLayout,
  CaseOverviewSkeleton,
  CaseOverviewSkeletonLayout,
  CollectDetailSkeleton,
  CollectQueueSkeleton,
  CollectQueueSkeletonLayout,
  DashboardActivityPanelSkeleton,
  DashboardActivitySkeletonLayout,
  DashboardOverviewPanelsSkeletonLayout,
  DashboardOverviewSkeleton,
  DashboardOverviewSkeletonLayout,
  DossierConnectionsSkeletonLayout,
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
  TableBodySkeletonLayout,
} from "@/shared/ui/skeletons";

/**
 * Behaviour pin for the skeleton surface: every export is rendered with the props its
 * callers use (plus the variants that change the markup) and checked for markup that is
 * present, free of leaked values and free of React warnings. The markup itself is not
 * snapshotted: the file fixture only proved the one-time split into `skeletons/`.
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
  [
    "LoadingRegion",
    () => (
      <LoadingRegion label="Loading items">
        <span>placeholder</span>
      </LoadingRegion>
    ),
  ],
];

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
});
