import { LibraryEntryLoader } from "@/domains/library/components/library-entry-loader";
import { LibraryPlaybookDetail } from "@/domains/library/components/library-playbook-detail";

export type LibraryPlaybookPageProps = {
  playbookId: string;
};

/** A Playbook's own page (`/library/playbooks/$playbookId`): the shared entry frame around the Playbook body. */
export function LibraryPlaybookPage({ playbookId }: LibraryPlaybookPageProps) {
  return (
    <LibraryEntryLoader kind="playbook" id={playbookId}>
      {(entry) => <LibraryPlaybookDetail entry={entry} />}
    </LibraryEntryLoader>
  );
}
