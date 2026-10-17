import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/primitives/button";
import { RelativeTime } from "@/shared/ui/relative-time";
import { SectionLabel } from "@/shared/ui/section-label";
import { TimelineDot } from "@/shared/ui/timeline-dot";
import { TimelineSpine } from "@/shared/ui/timeline-spine";
import { statusLabel } from "@/shared/ui/vocab";
import { STATUS_DOT } from "@/shared/ui/vocab/status.lib";
import type { JobListRecord } from "@watchdog/core/jobs";

type JobAttemptsProps = {
  /** Every attempt, oldest first (see `attemptChain`). Renders nothing for one. */
  attempts: readonly JobListRecord[];
  currentId: string;
  onSelect?: (jobId: string) => void;
};

/** The earlier and later attempts of a retried Job. */
export function JobAttempts({
  attempts,
  currentId,
  onSelect,
}: JobAttemptsProps) {
  if (attempts.length < 2) return null;

  return (
    <section aria-label="Attempts">
      <SectionLabel as="span" density="compact">
        Attempts
      </SectionLabel>
      <div className="mt-2">
        <TimelineSpine className="ml-2 pl-4">
          {attempts.map((attempt, i) => {
            const isCurrent = attempt.id === currentId;
            const isLast = i === attempts.length - 1;
            return (
              <div
                key={attempt.id}
                className={cn("relative", !isLast && "pb-3")}
                aria-current={isCurrent ? "true" : undefined}
              >
                <TimelineDot className={STATUS_DOT[attempt.status]} />
                <p className="text-xs">
                  {isCurrent || onSelect === undefined ? (
                    <span>Attempt {i + 1}</span>
                  ) : (
                    <Button
                      type="button"
                      variant="link"
                      size="inline"
                      onClick={() => {
                        onSelect(attempt.id);
                      }}
                    >
                      Attempt {i + 1}
                    </Button>
                  )}{" "}
                  <span className="text-muted-foreground font-normal">
                    {statusLabel(attempt.status)}
                    {isCurrent ? " · this attempt" : ""}
                    {" · "}
                    <RelativeTime value={attempt.createdAt} />
                  </span>
                </p>
              </div>
            );
          })}
        </TimelineSpine>
      </div>
    </section>
  );
}
