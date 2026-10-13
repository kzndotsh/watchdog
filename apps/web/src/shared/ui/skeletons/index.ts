/**
 * Skeleton loading states for each major surface.
 *
 * Each component mirrors the layout of the real content so the
 * transition is smooth and there's no layout shift.
 *
 * **Tables:** production loading uses `DataTable` `isPending` + per-cell
 * skeleton rows (colgroup-aligned) — never wrap table bodies in `PendingRegion`.
 * See [`docs/reference/web/ui/loading.md`](../../../../../docs/reference/web/ui/loading.md).
 *
 * **Naming:** `*Skeleton` — PendingRegion fallback / exported loading UI.
 * `*SkeletonLayout` — inner layout blocks composed by `*Skeleton` (or wrapped
 * in `LoadingRegion` directly, e.g. dossier tab pending).
 * **LoadingRegion:** owned by `PendingRegion` / route shells.
 */

export {
  TABLE_BODY_SKELETON_ROW_COUNT,
  BOARD_SKELETON_COLUMN_COUNT,
  BOARD_SKELETON_CARDS_PER_COLUMN,
  CARD_GRID_SKELETON_SLOT_COUNT,
  DASHBOARD_METRIC_TILE_COUNT,
  DASHBOARD_ACTIVITY_SKELETON_ROW_COUNT,
  COLLECT_QUEUE_SKELETON_ROW_COUNT,
} from "./constants";
export { CollectQueueSkeletonLayout } from "./collect/collect-queue-skeleton-layout";
export { CollectQueueSkeleton } from "./collect/collect-queue-skeleton";
export { CollectDetailSkeleton } from "./collect/collect-detail-skeleton";
export { QueueBodySkeletonLayout } from "./bodies/queue-body-skeleton-layout";
export { CardGridSkeletonLayout } from "./bodies/card-grid-skeleton-layout";
export { StackBodySkeletonLayout } from "./bodies/stack-body-skeleton-layout";
export { QueueSkeleton } from "./bodies/queue-skeleton";
export { BoardSkeletonLayout } from "./bodies/board-skeleton-layout";
export { BoardSkeleton } from "./bodies/board-skeleton";
export { CardGridSkeleton } from "./bodies/card-grid-skeleton";
export { StackBodySkeleton } from "./bodies/stack-body-skeleton";
export { MetricTilesSkeletonLayout } from "./dashboard/metric-tiles-skeleton-layout";
export { DashboardOverviewPanelsSkeletonLayout } from "./dashboard/dashboard-overview-panels-skeleton-layout";
export { DashboardOverviewSkeletonLayout } from "./dashboard/dashboard-overview-skeleton-layout";
export { DashboardOverviewSkeleton } from "./dashboard/dashboard-overview-skeleton";
export { DashboardActivitySkeletonLayout } from "./dashboard/dashboard-activity-skeleton-layout";
export { DashboardActivityPanelSkeleton } from "./dashboard/dashboard-activity-panel-skeleton";
export { CaseOverviewSkeletonLayout } from "./case-overview-skeleton-layout";
export { CaseOverviewSkeleton } from "./case-overview-skeleton";
export { TableBodySkeletonLayout } from "./table-body-skeleton-layout";
export { RoutePendingSkeletonLayout } from "./route-pending-skeleton-layout";
export { DossierOverviewSkeletonLayout } from "./dossier/dossier-overview-skeleton-layout";
export { DossierNotesSkeletonLayout } from "./dossier/dossier-notes-skeleton-layout";
export { DossierPanelSkeletonLayout } from "./dossier/dossier-panel-skeleton-layout";
export { DossierConnectionsSkeletonLayout } from "./dossier/dossier-connections-skeleton-layout";
export { DossierEvidenceSkeletonLayout } from "./dossier/dossier-evidence-skeleton-layout";
export {
  TASK_BOARD_COLUMN_SHELL_CLASS,
  TASK_CARD_SHELL_CLASS,
} from "@/shared/ui/task-board-shell";
export { LoadingRegion } from "@/shared/ui/loading-region";
export { SettingsCredentialsSkeleton } from "./settings/settings-credentials-skeleton";
