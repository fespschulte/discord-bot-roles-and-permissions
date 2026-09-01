export const allowedSubscriptionStatuses = [
  "ACTIVE",
  "INACTIVE",
  "DELAYED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_SELLER",
  "CANCELLED_BY_ADMIN",
  "STARTED",
  "OVERDUE",
] as const;

export type SubscriptionStatus = (typeof allowedSubscriptionStatuses)[number];

export function parseSubscriptionStatus(status: any): SubscriptionStatus {
  if (allowedSubscriptionStatuses.includes(status)) {
    return status;
  }
  console.warn("[Hotmart] Received unknown subscription status:", status);
  return "INACTIVE";
}
