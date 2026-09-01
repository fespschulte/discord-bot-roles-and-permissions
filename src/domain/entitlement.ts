import type { SubscriptionStatus } from "../utils/subscriptionStatus";

export type EntitlementIntent = "GRANT" | "REVOKE" | "NO_CHANGE";

// Hotmart reports `purchase.status` and `subscription.status` from two different
// vocabularies that overlap on STARTED and OVERDUE with different meanings, and a
// PURCHASE_APPROVED payload can carry `purchase.status: "STARTED"`. The event name is
// therefore the only reliable signal for purchase events.
const GRANTING_EVENTS = new Set(["PURCHASE_APPROVED", "PURCHASE_COMPLETE"]);

const REVOKING_EVENTS = new Set([
  "PURCHASE_CANCELED",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "PURCHASE_EXPIRED",
  "PURCHASE_PROTEST",
  "PURCHASE_BILLET_PRINTED",
  "PURCHASE_DELAYED",
  "SUBSCRIPTION_CANCELLATION",
]);

const PAID_PURCHASE_STATUSES = new Set(["APPROVED", "COMPLETE"]);

export function shouldHaveVipAccess(status: SubscriptionStatus): boolean {
  return status === "ACTIVE";
}

export function resolveEntitlement(
  event: string,
  subscriptionStatus?: string,
  purchaseStatus?: string
): EntitlementIntent {
  if (GRANTING_EVENTS.has(event)) {
    return "GRANT";
  }
  if (REVOKING_EVENTS.has(event)) {
    return "REVOKE";
  }
  if (subscriptionStatus) {
    return subscriptionStatus === "ACTIVE" ? "GRANT" : "REVOKE";
  }
  if (purchaseStatus) {
    return PAID_PURCHASE_STATUSES.has(purchaseStatus) ? "GRANT" : "REVOKE";
  }
  // An event carrying no status at all says nothing about entitlement. Revoking here is
  // what caused paid members to silently lose access.
  return "NO_CHANGE";
}
