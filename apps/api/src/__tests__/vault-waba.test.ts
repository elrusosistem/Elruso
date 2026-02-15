import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateWabaIdsFormat } from "../vault.js";

describe("validateWabaIdsFormat", () => {
  it("accepts valid numeric WABA_PHONE_NUMBER_ID", async () => {
    const result = await validateWabaIdsFormat({ WABA_PHONE_NUMBER_ID: "123456789" });
    expect(result.ok).toBe(true);
  });

  it("rejects non-numeric WABA_PHONE_NUMBER_ID", async () => {
    const result = await validateWabaIdsFormat({ WABA_PHONE_NUMBER_ID: "abc" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("numerico");
  });

  it("accepts valid numeric WABA_BUSINESS_ACCOUNT_ID", async () => {
    const result = await validateWabaIdsFormat({ WABA_BUSINESS_ACCOUNT_ID: "987654321" });
    expect(result.ok).toBe(true);
  });

  it("rejects non-numeric WABA_BUSINESS_ACCOUNT_ID", async () => {
    const result = await validateWabaIdsFormat({ WABA_BUSINESS_ACCOUNT_ID: "not-a-number" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("numerico");
  });

  it("accepts valid numeric META_APP_ID", async () => {
    const result = await validateWabaIdsFormat({ META_APP_ID: "111222333" });
    expect(result.ok).toBe(true);
  });

  it("rejects non-numeric META_APP_ID", async () => {
    const result = await validateWabaIdsFormat({ META_APP_ID: "abc123" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("numerico");
  });

  it("accepts https WEBHOOK_CALLBACK_URL", async () => {
    const result = await validateWabaIdsFormat({ WEBHOOK_CALLBACK_URL: "https://example.com/webhook" });
    expect(result.ok).toBe(true);
  });

  it("rejects http WEBHOOK_CALLBACK_URL", async () => {
    const result = await validateWabaIdsFormat({ WEBHOOK_CALLBACK_URL: "http://example.com/webhook" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("https://");
  });

  it("accepts empty values (no keys present)", async () => {
    const result = await validateWabaIdsFormat({});
    expect(result.ok).toBe(true);
  });

  it("validates all fields together", async () => {
    const result = await validateWabaIdsFormat({
      WABA_PHONE_NUMBER_ID: "123",
      WABA_BUSINESS_ACCOUNT_ID: "456",
      META_APP_ID: "789",
      WEBHOOK_CALLBACK_URL: "https://hooks.example.com/waba",
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateWabaToken (mock)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("validates token against Graph API (success mock)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ display_phone_number: "+5491155551234", verified_name: "Test Biz" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const vault = await import("../vault.js");

    // Save phone values first so validateWabaToken can find them
    vault.saveRequestValues("REQ-WABA-PHONE", { WABA_PHONE_NUMBER_ID: "12345" });
    vault.saveRequestValues("REQ-WABA-TOKEN", { WABA_ACCESS_TOKEN: "mock-token" });

    const result = await vault.validateProvider("REQ-WABA-TOKEN");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("WABA OK");

    // Verify correct Graph API URL was called
    expect(mockFetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v19.0/12345?fields=display_phone_number,verified_name",
      { headers: { Authorization: "Bearer mock-token" } },
    );

    vi.unstubAllGlobals();
  });

  it("returns error on 401 from Graph API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const vault = await import("../vault.js");
    vault.saveRequestValues("REQ-WABA-PHONE", { WABA_PHONE_NUMBER_ID: "12345" });
    vault.saveRequestValues("REQ-WABA-TOKEN", { WABA_ACCESS_TOKEN: "bad-token" });

    const result = await vault.validateProvider("REQ-WABA-TOKEN");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("invalido");

    vi.unstubAllGlobals();
  });
});
