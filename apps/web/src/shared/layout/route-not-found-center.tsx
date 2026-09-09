import type { ReactNode } from "react";

export function RouteNotFoundCenter({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8">
      <div className="bg-background text-foreground flex w-full max-w-lg flex-col gap-4 rounded-md border p-6 sm:p-8">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
          404
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
