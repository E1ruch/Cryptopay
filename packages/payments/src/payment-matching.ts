export interface InvoicePaymentTarget {
  network: string;
  token: string;
  paymentAddress: string;
}

export interface DetectedTransfer {
  network: string;
  token: string;
  toAddress: string;
}

/**
 * A transfer belongs to an invoice only if network, token, and destination
 * address all agree (spec §47) — never match on address or amount alone.
 * Phase 1 dedicates one payment address per invoice, so amount is
 * deliberately not part of the match: it is evaluated separately by
 * {@link evaluatePaymentAmount} to classify exact/underpaid/overpaid, not to
 * decide whether the transfer is for this invoice at all.
 */
export function matchesInvoice(target: InvoicePaymentTarget, transfer: DetectedTransfer): boolean {
  return (
    target.network === transfer.network &&
    target.token === transfer.token &&
    target.paymentAddress.toLowerCase() === transfer.toAddress.toLowerCase()
  );
}
