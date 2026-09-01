import { describe, expect, it } from "vitest";
import { resolveEntitlement, shouldHaveVipAccess } from "./entitlement";

describe("resolveEntitlement", () => {
  it("grants on an approved purchase even when purchase.status says STARTED", () => {
    // Hotmart's own PURCHASE_APPROVED example carries purchase.status "STARTED". Reading
    // that status instead of the event is what used to revoke access from paying members.
    expect(resolveEntitlement("PURCHASE_APPROVED", undefined, "STARTED")).toBe(
      "GRANT"
    );
  });

  it.each(["PURCHASE_APPROVED", "PURCHASE_COMPLETE"])(
    "grants on %s",
    (event) => {
      expect(resolveEntitlement(event)).toBe("GRANT");
    }
  );

  it.each([
    "PURCHASE_CANCELED",
    "PURCHASE_REFUNDED",
    "PURCHASE_CHARGEBACK",
    "PURCHASE_EXPIRED",
    "PURCHASE_PROTEST",
    "PURCHASE_BILLET_PRINTED",
    "PURCHASE_DELAYED",
    "SUBSCRIPTION_CANCELLATION",
  ])("revokes on %s", (event) => {
    expect(resolveEntitlement(event)).toBe("REVOKE");
  });

  it("revokes a cancellation even when the payload still reports ACTIVE", () => {
    expect(resolveEntitlement("SUBSCRIPTION_CANCELLATION", "ACTIVE")).toBe(
      "REVOKE"
    );
  });

  it("falls back to subscription.status for other subscription events", () => {
    expect(resolveEntitlement("SWITCH_PLAN", "ACTIVE")).toBe("GRANT");
    expect(resolveEntitlement("SWITCH_PLAN", "OVERDUE")).toBe("REVOKE");
    expect(
      resolveEntitlement("UPDATE_SUBSCRIPTION_CHARGE_DATE", "DELAYED")
    ).toBe("REVOKE");
  });

  it("falls back to purchase.status for unrecognized purchase events", () => {
    expect(
      resolveEntitlement("PURCHASE_OUT_OF_SHOPPING_CART", undefined, "APPROVED")
    ).toBe("GRANT");
    expect(
      resolveEntitlement(
        "PURCHASE_OUT_OF_SHOPPING_CART",
        undefined,
        "WAITING_PAYMENT"
      )
    ).toBe("REVOKE");
  });

  it("prefers subscription.status over purchase.status", () => {
    expect(
      resolveEntitlement("SOME_NEW_EVENT", "ACTIVE", "WAITING_PAYMENT")
    ).toBe("GRANT");
  });

  it("leaves entitlement untouched for an event carrying no status", () => {
    // Revoking on an absent optional field is the silent-revoke failure we are fixing.
    expect(resolveEntitlement("SOME_NEW_EVENT")).toBe("NO_CHANGE");
  });
});

describe("shouldHaveVipAccess", () => {
  it("only grants access while the subscription is ACTIVE", () => {
    expect(shouldHaveVipAccess("ACTIVE")).toBe(true);
    expect(shouldHaveVipAccess("INACTIVE")).toBe(false);
    expect(shouldHaveVipAccess("CANCELLED_BY_CUSTOMER")).toBe(false);
    expect(shouldHaveVipAccess("OVERDUE")).toBe(false);
  });
});
