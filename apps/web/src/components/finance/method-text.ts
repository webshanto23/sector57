/**
 * "Bank (Cheque · 771204)": the account money left or reached, with how it was paid when that
 * was not plain cash. Takes translated labels, so server and client pages can both use it.
 */
export function paidFrom(account: string, method: string | null, ref: string | null, isCash: boolean): string {
  if (isCash || !method) return account;
  return `${account} (${[method, ref].filter(Boolean).join(" · ")})`;
}
