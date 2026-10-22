import { LibraryCapDetail } from "@/domains/library/components/library-cap-detail";
import { LibraryEntryLoader } from "@/domains/library/components/library-entry-loader";

export type LibraryCapPageProps = {
  capId: string;
};

/** A Cap's own page (`/library/caps/$capId`): the entry frame around the Cap's detail. */
export function LibraryCapPage({ capId }: LibraryCapPageProps) {
  return (
    <LibraryEntryLoader kind="cap" id={capId}>
      {(entry) => <LibraryCapDetail entry={entry} />}
    </LibraryEntryLoader>
  );
}
