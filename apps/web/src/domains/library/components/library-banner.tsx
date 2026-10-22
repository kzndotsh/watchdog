import type { ReactNode } from "react";

import { LIBRARY_BANNER_CLASS } from "@/shared/ui/library-shell";

export type LibraryBannerProps = {
  label: string;
  children: ReactNode;
};

/** The shared frame of the Library's banners: a labelled region above the cards. */
export function LibraryBanner({ label, children }: LibraryBannerProps) {
  return (
    <section aria-label={label} className={LIBRARY_BANNER_CLASS}>
      {children}
    </section>
  );
}
