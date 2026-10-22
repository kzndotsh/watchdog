import { TASK_STATUSES } from "@watchdog/schemas/shared";

/** Median visible rows for entity/identifier tables. */
export const TABLE_BODY_SKELETON_ROW_COUNT = 8;

/** Kanban columns — matches TASK_STATUSES length in task-board. */
export const BOARD_SKELETON_COLUMN_COUNT = TASK_STATUSES.length;

/** Median cards per task column — shared with task-board-column. */
export const BOARD_SKELETON_CARDS_PER_COLUMN = 3;

/** Default case grid slot count (1 page of cards). */
export const CARD_GRID_SKELETON_SLOT_COUNT = 6;

/** Library cards shown while the catalog loads: four rows of the three-column grid. */
export const LIBRARY_CARD_SKELETON_SLOT_COUNT = 12;

/** Dashboard overview metric tiles — matches MetricsSection grid. */
export const DASHBOARD_METRIC_TILE_COUNT = 6;

/** Median visible activity rows on the dashboard feed. */
export const DASHBOARD_ACTIVITY_SKELETON_ROW_COUNT = 5;

/** Median visible Collect queue rows — shared with collect.tsx. */
export const COLLECT_QUEUE_SKELETON_ROW_COUNT = 10;

/** Settings > Credentials: connected rows shown while loading (one `Updated` line + two buttons each). */
export const SETTINGS_CREDENTIALS_SKELETON_CONNECTED_ROWS = 2;

/**
 * Settings > Credentials: not-connected rows shown while loading. The catalog has dozens of
 * slots; this is the median that fits a viewport, not the maximum.
 */
export const SETTINGS_CREDENTIALS_SKELETON_DISCONNECTED_ROWS = 6;

/** Settings > Members: member rows shown while loading (median small team, not the maximum). */
export const SETTINGS_MEMBERS_SKELETON_ROWS = 3;

/** Rich-text editor skeleton: toolbar controls shown (headings, marks, lists; a median, not exact). */
export const RICH_TEXT_SKELETON_TOOLBAR_BUTTON_COUNT = 6;
