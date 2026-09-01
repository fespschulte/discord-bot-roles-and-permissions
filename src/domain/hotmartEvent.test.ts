import { describe, expect, it } from "vitest";
import { hotmartEventSchema, normalizeHotmartEvent } from "./hotmartEvent";

// Trimmed from Hotmart's documented PURCHASE_APPROVED example. Note that purchase.status is
// "STARTED" and that the subscription block has no id, only a subscriber code.
const purchaseApproved = {
  id: "1234567890123456789",
  creation_date: 12_345_678,
  event: "PURCHASE_APPROVED",
  version: "2.0.0",
  data: {
    product: { id: 213_344, name: "Product Name" },
    buyer: { email: "Buyer@Email.com", name: "Buyer Name" },
    purchase: {
      status: "STARTED",
      date_next_charge: 1_736_337_600_000,
      transaction: "HP02316330308193",
    },
    subscription: {
      status: "ACTIVE",
      plan: { id: 711_459, name: "plan name" },
      subscriber: { code: "12133421" },
    },
  },
};

const subscriptionCancellation = {
  id: "9876543210987654321",
  creation_date: 12_345_678,
  event: "SUBSCRIPTION_CANCELLATION",
  version: "2.0.0",
  data: {
    subscriber: {
      email: "subscriber@email.com",
      code: "12133421",
      name: "Subscriber Name",
    },
    product: { id: 213_344, name: "Product Name" },
    subscription: {
      id: 555_666,
      status: "CANCELLED_BY_CUSTOMER",
      plan: { name: "plan name" },
    },
    cancellation_date: 1_736_337_600_000,
  },
};

describe("hotmartEventSchema", () => {
  it("accepts the documented purchase payload", () => {
    expect(hotmartEventSchema.safeParse(purchaseApproved).success).toBe(true);
  });

  it("accepts the documented subscription payload", () => {
    expect(hotmartEventSchema.safeParse(subscriptionCancellation).success).toBe(
      true
    );
  });

  it("rejects a payload that is not a Hotmart event", () => {
    expect(hotmartEventSchema.safeParse({ hello: "world" }).success).toBe(
      false
    );
  });
});

describe("normalizeHotmartEvent", () => {
  it("normalizes a purchase payload", () => {
    const parsed = hotmartEventSchema.parse(purchaseApproved);

    expect(normalizeHotmartEvent(parsed)).toEqual({
      event: "PURCHASE_APPROVED",
      email: "Buyer@Email.com",
      name: "Buyer Name",
      subscriberCode: "12133421",
      subscriptionId: "12133421",
      subscriptionStatus: "ACTIVE",
      purchaseStatus: "STARTED",
      dateNextCharge: new Date(1_736_337_600_000),
      planName: "plan name",
      productName: "Product Name",
    });
  });

  it("keeps the two status vocabularies apart", () => {
    const parsed = hotmartEventSchema.parse(purchaseApproved);
    const normalized = normalizeHotmartEvent(parsed);

    expect(normalized.subscriptionStatus).not.toBe(normalized.purchaseStatus);
  });

  it("falls back to the transaction when there is no subscriber code", () => {
    const parsed = hotmartEventSchema.parse({
      ...purchaseApproved,
      data: { ...purchaseApproved.data, subscription: undefined },
    });

    expect(normalizeHotmartEvent(parsed).subscriptionId).toBe(
      "HP02316330308193"
    );
  });

  it("normalizes a subscription payload", () => {
    const parsed = hotmartEventSchema.parse(subscriptionCancellation);

    expect(normalizeHotmartEvent(parsed)).toEqual({
      event: "SUBSCRIPTION_CANCELLATION",
      email: "subscriber@email.com",
      name: "Subscriber Name",
      subscriberCode: "12133421",
      subscriptionId: "12133421",
      subscriptionStatus: "CANCELLED_BY_CUSTOMER",
      cancellationDate: new Date(1_736_337_600_000),
      dateNextCharge: undefined,
      planName: "plan name",
      productName: "Product Name",
    });
  });

  it("references the same subscription across both event families", () => {
    const purchase = normalizeHotmartEvent(
      hotmartEventSchema.parse(purchaseApproved)
    );
    const cancellation = normalizeHotmartEvent(
      hotmartEventSchema.parse(subscriptionCancellation)
    );

    expect(purchase.subscriptionId).toBe(cancellation.subscriptionId);
  });
});
