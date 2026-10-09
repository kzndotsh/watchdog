import {
  bansNode,
  calleeName,
  memberName,
  REPO_CONTRACT,
} from "../lib/db-repo.mjs";

/** Repos never open a transaction: services own the boundary and pass the handle in. */
export const dbRepoNoTransaction = bansNode({
  type: "CallExpression",
  test: (node) =>
    memberName(node.callee) === "transaction" ||
    calleeName(node) === "transact",
  description: "Ban .transaction() and transact() in packages/db repos.",
  message: `Repos must not open transactions: take exec: DbExec first and let the calling service own the boundary (transact) (${REPO_CONTRACT} rule 4).`,
});
