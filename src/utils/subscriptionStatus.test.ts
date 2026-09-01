import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowedSubscriptionStatuses,
  parseSubscriptionStatus,
} from "./subscriptionStatus";

describe("parseSubscriptionStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(allowedSubscriptionStatuses)("passes %s through", (status) => {
    expect(parseSubscriptionStatus(status)).toBe(status);
  });

  it("stays in sync with the database enum", () => {
    expect(allowedSubscriptionStatuses).toContain("ACTIVE");
    expect(allowedSubscriptionStatuses).toContain("INACTIVE");
  });

  it.each([
    ["a status Hotmart has not documented", "SOMETHING_NEW"],
    ["a lowercase variant", "active"],
    ["a missing value", undefined],
    ["a non-string", 42],
  ])("falls back to INACTIVE for %s", (_label, input) => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      // silence the expected warning
    });

    expect(parseSubscriptionStatus(input)).toBe("INACTIVE");
  });

  it("warns when it cannot recognize a status", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {
      // silence the expected warning
    });

    parseSubscriptionStatus("UNKNOWN");

    expect(warn).toHaveBeenCalled();
  });
});
