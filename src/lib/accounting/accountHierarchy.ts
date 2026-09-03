import type { Account } from '../../types/erp';

/**
 * True when the account's name or code contains the (lowercased, trimmed)
 * search term. An empty term matches everything.
 */
export function accountMatchesSearch(account: Account, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    account.name.toLowerCase().includes(q) ||
    account.code.toLowerCase().includes(q)
  );
}

/**
 * Chart-of-Accounts search semantics — which accounts to RENDER for a term.
 *
 * Returns every account whose name/code matches, PLUS the ancestor chain of
 * each match (the parent control accounts of nested party accounts). The chart
 * renders rows starting from TOP-LEVEL accounts and recurses into children via
 * parentId, so a matched child whose ancestors are not included becomes
 * unreachable and its whole section collapses to empty — the "saved party
 * doesn't show in Chart of Accounts" symptom.
 *
 * Non-matching siblings stay hidden; with an empty search all accounts are
 * returned unchanged (identical to no search).
 */
export function filterAccountsWithAncestors(accounts: Account[], search: string): Account[] {
  const q = search.trim().toLowerCase();
  if (!q) return accounts;

  const byId = new Map(accounts.map(a => [a.id, a] as const));
  const visible = new Set<string>();

  for (const account of accounts) {
    if (!accountMatchesSearch(account, q)) continue;
    let cursor: Account | undefined = account;
    for (let hops = 0; cursor && !visible.has(cursor.id) && hops < 50; hops++) {
      visible.add(cursor.id);
      const parentId: string | undefined = cursor.parentId;
      cursor = parentId ? byId.get(parentId) : undefined;
    }
  }

  return accounts.filter(a => visible.has(a.id));
}
