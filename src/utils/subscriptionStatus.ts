import { subscriptionStatusEnum } from "../db/schema/subscriptions";

export const allowedSubscriptionStatuses = subscriptionStatusEnum.enumValues;

export type SubscriptionStatus = (typeof allowedSubscriptionStatuses)[number];

function isSubscriptionStatus(status: unknown): status is SubscriptionStatus {
  return (
    typeof status === "string" &&
    (allowedSubscriptionStatuses as readonly string[]).includes(status)
  );
}

export function parseSubscriptionStatus(status: unknown): SubscriptionStatus {
  if (isSubscriptionStatus(status)) {
    return status;
  }
  console.warn("[Hotmart] Received unknown subscription status:", status);
  return "INACTIVE";
}
