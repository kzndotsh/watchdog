import { Button } from "@/shared/ui/primitives/button";

/**
 * The download of a finished Case export Job. The link is the Job's own and expires: past
 * `WD_EXPORT_LINK_TTL_HOURS` it answers 410 and the archive is gone.
 */
export function JobExportDownload({ path }: { path: string }) {
  return (
    <Button
      nativeButton={false}
      render={<a href={path} download aria-label="Download export" />}
    >
      Download export
    </Button>
  );
}
