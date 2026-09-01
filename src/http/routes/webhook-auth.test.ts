import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isBotReady } from "../../bot/state";
import { buildApp } from "../../server";

vi.mock("../../bot/state", () => ({
  isBotReady: vi.fn(() => true),
  markBotReady: vi.fn(),
}));

vi.mock("../../bot/roles", () => ({
  VIP_ROLE_NAME: "TEST VIP",
  addVipRole: vi.fn(),
  removeVipRole: vi.fn(),
  memberHasVipRole: vi.fn(),
  setDiscordClient: vi.fn(),
}));

// Mocked so the suite never needs a database.
vi.mock("../../services/subscriptionService", () => ({
  findUserByEmailAndGuild: vi.fn(() => Promise.resolve(undefined)),
  updateOrInsertSubscription: vi.fn(() => Promise.resolve(undefined)),
  findActiveSubscriptionByEmail: vi.fn(),
  linkDiscordToEmail: vi.fn(),
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}));

const app = buildApp({ logger: false });

const payload = {
  id: "1234567890123456789",
  creation_date: 12_345_678,
  event: "PURCHASE_APPROVED",
  version: "2.0.0",
  data: {
    product: { id: 213_344, name: "Product Name" },
    buyer: { email: "buyer@email.com", name: "Buyer Name" },
    purchase: { status: "STARTED", transaction: "HP02316330308193" },
    subscription: { status: "ACTIVE", subscriber: { code: "12133421" } },
  },
};

function post(headers: Record<string, string>, body: unknown = payload) {
  return app.inject({
    method: "POST",
    url: "/webhook/hotmart",
    headers,
    payload: body as Record<string, unknown>,
  });
}

beforeEach(() => {
  vi.mocked(isBotReady).mockReturnValue(true);
});

afterAll(async () => {
  await app.close();
});

describe("POST /webhook/hotmart authentication", () => {
  it("rejects a delivery with no hottok", async () => {
    const response = await post({});

    expect(response.statusCode).toBe(401);
  });

  it("rejects a delivery with the wrong hottok", async () => {
    const response = await post({ "x-hotmart-hottok": "not-the-secret" });

    expect(response.statusCode).toBe(401);
  });

  it("rejects a delivery whose hottok only shares a prefix", async () => {
    const response = await post({ "x-hotmart-hottok": "test" });

    expect(response.statusCode).toBe(401);
  });

  it("rejects before validating the body, so a bad payload still reads as 401", async () => {
    const response = await post({}, { not: "a hotmart event" });

    expect(response.statusCode).toBe(401);
  });

  it("accepts a delivery carrying the configured hottok", async () => {
    const response = await post({ "x-hotmart-hottok": "test-hottok" });

    expect(response.statusCode).toBe(200);
  });
});

describe("POST /webhook/hotmart readiness", () => {
  it("asks Hotmart to retry while the Discord gateway is still connecting", async () => {
    vi.mocked(isBotReady).mockReturnValue(false);

    const response = await post({ "x-hotmart-hottok": "test-hottok" });

    expect(response.statusCode).toBe(503);
  });
});

describe("GET /health", () => {
  it("stays open, since the hottok check is scoped to the webhook route", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
  });
});
