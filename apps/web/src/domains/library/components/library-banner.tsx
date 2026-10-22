import type { ReactNode } from "react";

export type LibraryBannerProps = {
  label: string;
  children: ReactNode;
};

/** The shared frame of the Library's banners: a labelled region above the cards. */
export function LibraryBanner({ label, children }: LibraryBannerProps) {
  return (
    <section
      aria-label={label}
      className="border-border bg-muted/20 flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      {children}
    </section>
  );
}
