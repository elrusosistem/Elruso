import { describe, it, expect } from "vitest";
import { redact, redactValue, redactPatterns, containsSecrets } from "../redact.js";

describe("redactValue", () => {
  it("returns *** for short values", () => {
    expect(redactValue("abc")).toBe("***");
    expect(redactValue("12345678")).toBe("***");
  });

  it("shows last 4 chars for long values", () => {
    expect(redactValue("sk-abc123456789")).toBe("***6789");
    expect(redactValue("my-super-secret-token")).toBe("***oken");
  });
});

describe("redactPatterns", () => {
  it("redacts OpenAI sk- keys", () => {
    const input = "Using key sk-proj-abc123def456ghi789jkl012mno";
    const result = redactPatterns(input);
    expect(result).toBe("Using key sk-***REDACTED***");
    expect(result).not.toContain("abc123");
  });

  it("redacts Render rnd_ tokens", () => {
    const input = "RENDER_API_TOKEN=rnd_abcdefghij1234567890klmnop";
    const result = redactPatterns(input);
    expect(result).not.toContain("abcdefghij");
  });

  it("redacts JWT tokens", () => {
    const input = "Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0";
    const result = redactPatterns(input);
    expect(result).toBe("Key: ***JWT_REDACTED***");
  });

  it("redacts Authorization headers", () => {
    const input = 'Authorization: Bearer my-secret-token-1234567890';
    const result = redactPatterns(input);
    expect(result).toBe("Authorization: Bearer ***REDACTED***");
  });

  it("redacts apikey headers", () => {
    const input = "apikey: sbp_1234567890abcdefghijklmnop";
    const result = redactPatterns(input);
    expect(result).not.toContain("1234567890");
  });

  it("redacts URL query params with tokens", () => {
    const input = "https://example.com/api?name=test&token=secret123&other=ok";
    const result = redactPatterns(input);
    expect(result).toContain("token=***REDACTED***");
    expect(result).toContain("name=test");
  });

  it("redacts PostgreSQL connection strings", () => {
    const input = "postgresql://user:p4ssw0rd@db.example.com:5432/mydb";
    const result = redactPatterns(input);
    expect(result).toBe("postgresql://***:***@db.example.com:5432/mydb");
    expect(result).not.toContain("p4ssw0rd");
  });

  it("leaves clean text untouched", () => {
    const input = "Just a normal log line with no secrets";
    expect(redactPatterns(input)).toBe(input);
  });
});

describe("redact (combined)", () => {
  it("replaces known vault secrets first", () => {
    const secrets = {
      SUPABASE_URL: "https://xyzproject.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.longsecretvalue1234567890",
    };
    const input = `Connecting to https://xyzproject.supabase.co with key eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.longsecretvalue1234567890`;
    const result = redact(input, secrets);
    expect(result).not.toContain("xyzproject.supabase.co");
    expect(result).not.toContain("longsecretvalue");
  });

  it("applies patterns even without vault secrets", () => {
    const input = "token=my-secret-value-1234";
    const result = redact(input);
    expect(result).toBe("token=***REDACTED***");
  });

  it("handles empty text", () => {
    expect(redact("")).toBe("");
    expect(redact("", {})).toBe("");
  });
});

describe("containsSecrets", () => {
  it("detects sk- keys", () => {
    expect(containsSecrets("sk-proj-abc123def456ghi789jkl")).toBe(true);
  });

  it("detects Authorization headers", () => {
    expect(containsSecrets("Authorization: Bearer xyz123")).toBe(true);
  });

  it("returns false for clean text", () => {
    expect(containsSecrets("Normal log output")).toBe(false);
  });

  it("detects connection strings", () => {
    expect(containsSecrets("postgres://user:pass@host:5432/db")).toBe(true);
  });
});
