import type { ReactNode } from "react";

type RouteNotFoundCenterProps = {
  /** The small label over the title: "404" by default, "Error" for a crash. */
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
};

export function RouteNotFoundCenter({
  eyebrow = "404",
  title,
  description,
  children,
}: RouteNotFoundCenterProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">
      <div className="bg-background text-foreground flex w-full max-w-lg flex-col gap-4 rounded-md border p-6 sm:p-8">
        <p className="text-muted-foreground tracking-eyebrow text-xs font-semibold uppercase">
          {eyebrow}
        </p>
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground text-base leading-7">
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
