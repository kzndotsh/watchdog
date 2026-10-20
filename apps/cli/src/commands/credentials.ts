import { api, emitList } from "../client";
import { asBoolean, defineNounCommand } from "../noun";

const LIST_COLUMNS = ["name", "configured", "updated", "label"];
const LIST_HELP = [
  "wd credentials list",
  "Add or remove a credential in Settings → Credentials (a signed-in session; an API key cannot)",
];

export const credentialsCmd = defineNounCommand({
  meta: {
    name: "credentials",
    description:
      "List vault credential slots (never prints secrets); set them in Settings → Credentials",
  },
  listArgs: {},
  required: [],
  paged: false,
  usageHelp: LIST_HELP,
  list: async (args) => {
    const rows = await api().credentials.list();
    emitList({
      items: rows.map((r) => ({
        name: r.name,
        configured: r.configured,
        updated: r.updatedAt ?? "",
        label: r.label,
      })),
      columns: LIST_COLUMNS,
      table: asBoolean(args.table),
      help: LIST_HELP,
    });
  },
});
