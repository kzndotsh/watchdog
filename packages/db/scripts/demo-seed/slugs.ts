/** Case slugs owned by `just seed-demo`. `--force` deletes only these. */
export const DEMO_CASE_SLUGS = [
  "ashmere-parcel-desk",
  "brine-copper-kit",
  "halden-staff-overlap",
  "keel-rowan-vendor",
  "plover-short-links",
  "westpier-tip",
] as const;

export type DemoCaseSlug = (typeof DEMO_CASE_SLUGS)[number];
