import { z } from "zod";

const basePlan = z.object({
  name: z.string().optional(),
  id: z.union([z.string(), z.number()]).optional(),
  offer: z.object({ key: z.string().optional() }).optional(),
});

const baseProduct = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
});

// Subscription lifecycle events: SUBSCRIPTION_CANCELLATION, SWITCH_PLAN,
// UPDATE_SUBSCRIPTION_CHARGE_DATE.
export const subscriptionEventSchema = z.object({
  id: z.string(),
  creation_date: z.number(),
  event: z.string(),
  version: z.string(),
  data: z.object({
    subscriber: z.object({
      email: z.email(),
      code: z.string().optional(),
      name: z.string().optional(),
    }),
    product: baseProduct.partial().optional(),
    subscription: z.object({
      id: z.union([z.string(), z.number()]).optional(),
      plan: basePlan.optional(),
      status: z.string().optional(),
    }),
    cancellation_date: z.number().optional(),
    date_next_charge: z.number().optional(),
  }),
});

// Purchase events: PURCHASE_APPROVED, PURCHASE_CANCELED, PURCHASE_REFUNDED and friends.
// Their `subscription` block carries no id, so the subscriber code is the stable reference.
export const purchaseEventSchema = z.object({
  id: z.string(),
  creation_date: z.number(),
  event: z.string(),
  version: z.string(),
  data: z.object({
    product: baseProduct,
    buyer: z
      .object({
        email: z.email(),
        name: z.string().optional(),
      })
      .optional(),
    purchase: z
      .object({
        status: z.string(),
        approved_date: z.number().optional(),
        date_next_charge: z.number().optional(),
        transaction: z.string().optional(),
      })
      .optional(),
    subscription: z
      .object({
        status: z.string().optional(),
        plan: basePlan.optional(),
        subscriber: z.object({ code: z.string().optional() }).optional(),
      })
      .optional(),
  }),
});

export const hotmartEventSchema = z.union([
  subscriptionEventSchema,
  purchaseEventSchema,
]);

export type HotmartEvent = z.infer<typeof hotmartEventSchema>;
type SubscriptionEvent = z.infer<typeof subscriptionEventSchema>;
type PurchaseEvent = z.infer<typeof purchaseEventSchema>;

export type NormalizedHotmartEvent = {
  event: string;
  email?: string;
  name?: string;
  subscriberCode?: string;
  /**
   * Stable reference for the subscription row. The subscriber code is preferred because it
   * is the only identifier both event families carry.
   */
  subscriptionId?: string;
  /** From `subscription.status`, the only field sharing the vocabulary of our enum. */
  subscriptionStatus?: string;
  /** From `purchase.status`, a different vocabulary. Never persisted as a subscription status. */
  purchaseStatus?: string;
  cancellationDate?: Date;
  dateNextCharge?: Date;
  planName?: string;
  productName?: string;
};

function isSubscriptionEvent(body: HotmartEvent): body is SubscriptionEvent {
  return "subscriber" in body.data;
}

function toDate(timestamp?: number): Date | undefined {
  return timestamp ? new Date(timestamp) : undefined;
}

function normalizeSubscriptionEvent(
  event: SubscriptionEvent
): NormalizedHotmartEvent {
  const { data } = event;
  const subscriptionId =
    data.subscription.id === undefined
      ? undefined
      : String(data.subscription.id);

  return {
    event: event.event,
    email: data.subscriber.email,
    name: data.subscriber.name,
    subscriberCode: data.subscriber.code,
    subscriptionId: data.subscriber.code ?? subscriptionId,
    subscriptionStatus: data.subscription.status,
    cancellationDate: toDate(data.cancellation_date),
    dateNextCharge: toDate(data.date_next_charge),
    planName: data.subscription.plan?.name,
    productName: data.product?.name,
  };
}

function normalizePurchaseEvent(event: PurchaseEvent): NormalizedHotmartEvent {
  const { data } = event;
  const subscriberCode = data.subscription?.subscriber?.code;

  return {
    event: event.event,
    email: data.buyer?.email,
    name: data.buyer?.name,
    subscriberCode,
    subscriptionId: subscriberCode ?? data.purchase?.transaction,
    subscriptionStatus: data.subscription?.status,
    purchaseStatus: data.purchase?.status,
    dateNextCharge: toDate(data.purchase?.date_next_charge),
    planName: data.subscription?.plan?.name,
    productName: data.product.name,
  };
}

export function normalizeHotmartEvent(
  body: HotmartEvent
): NormalizedHotmartEvent {
  return isSubscriptionEvent(body)
    ? normalizeSubscriptionEvent(body)
    : normalizePurchaseEvent(body);
}
