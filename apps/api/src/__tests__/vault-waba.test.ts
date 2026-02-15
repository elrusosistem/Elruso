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

  it("rejects when token is missing", async () => {
    // Import dynamically to allow mocking
    const { validateProvider } = await import("../vault.js");
    // Mock getRequestValues to return phone id
    vi.doMock("../vault.js", async (importOriginal) => {
      const original = await importOriginal<typeof import("../vault.js")>();
      return {
        ...original,
        getRequestValues: (id: string) =>
          id === "REQ-WABA-PHONE" ? { WABA_PHONE_NUMBER_ID: "12345" } : null,
      };
    });

    // Call with empty values simulates no token saved — validateProvider will catch it
    const result = await validateProvider("REQ-WABA-TOKEN");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("No hay valores guardados");
  });

  it("validates token against Graph API (success mock)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ display_phone_number: "+5491155551234", verified_name: "Test Biz" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    // We need to test validateWabaToken directly — import vault to get access
    const vault = await import("../vault.js");

    // Save phone values first so validateWabaToken can find them
    vault.saveRequestValues("REQ-WABA-PHONE", { WABA_PHONE_NUMBER_ID: "12345" });
    vault.saveRequestValues("REQ-WABA-TOKEN", { WABA_ACCESS_TOKEN: "mock-token" });

    const result = await vault.validateProvider("REQ-WABA-TOKEN");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("WABA OK");

    vi.unstubAllGlobals();
  });
});
