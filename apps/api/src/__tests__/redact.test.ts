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

  it("redacts sk-proj long keys (real format)", () => {
    // As standalone value (not after =)
    const input = "key is sk-proj-OzSkUNuTPqbWcRMN6Jz4CxyKtFVxrKyoD9xfECkj8C here";
    const result = redactPatterns(input);
    expect(result).toContain("sk-***REDACTED***");
    expect(result).not.toContain("OzSkUNu");
  });

  it("redacts sk- keys inside KEY= format", () => {
    const input = "OPENAI_API_KEY=sk-proj-OzSkUNuTPqbWcRMN6Jz4CxyKtFVxrKyoD9xfECkj8C";
    const result = redactPatterns(input);
    // api_key= pattern catches this first, but secret IS redacted
    expect(result).not.toContain("OzSkUNu");
    expect(result).toContain("REDACTED");
  });

  it("redacts Render rnd_ tokens (standalone)", () => {
    const input = "Using rnd_abcdefghij1234567890klmnop for API";
    const result = redactPatterns(input);
    expect(result).not.toContain("abcdefghij");
    expect(result).toContain("rnd_***REDACTED***");
  });

  it("redacts Render rnd_ tokens (in KEY= format)", () => {
    const input = "RENDER_API_TOKEN=rnd_abcdefghij1234567890klmnop";
    const result = redactPatterns(input);
    expect(result).not.toContain("abcdefghij");
    expect(result).toContain("REDACTED");
  });

  it("redacts Render rndr_ tokens", () => {
    const input = "Using rndr_MWMExosF8vPp6blpuo6Qasepk4lM for deploy";
    const result = redactPatterns(input);
    expect(result).toContain("rndr_***REDACTED***");
    expect(result).not.toContain("MWMExos");
  });

  it("redacts Vercel vcp_ tokens (standalone)", () => {
    const input = "Using vcp_5ecT5KNIAcBSLojhzz8kDUWPvSfs25yKiTUeqNmsaVVRye3E for deploy";
    const result = redactPatterns(input);
    expect(result).toContain("vcp_***REDACTED***");
    expect(result).not.toContain("5ecT5KN");
  });

  it("redacts Vercel vcp_ tokens (in TOKEN= format)", () => {
    const input = "VERCEL_TOKEN=vcp_5ecT5KNIAcBSLojhzz8kDUWPvSfs25yKiTUeqNmsaVVRye3E";
    const result = redactPatterns(input);
    expect(result).not.toContain("5ecT5KN");
    expect(result).toContain("REDACTED");
  });

  it("redacts Supabase sbp_ tokens", () => {
    const input = "sbp_1234567890abcdefghijklmnop is a key";
    const result = redactPatterns(input);
    expect(result).toContain("sbp_***REDACTED***");
    expect(result).not.toContain("1234567890");
  });

  it("redacts JWT tokens (Supabase keys)", () => {
    const input = "Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0";
    const result = redactPatterns(input);
    expect(result).toBe("Key: ***JWT_REDACTED***");
  });

  it("redacts Supabase service role key (JWT format)", () => {
    const input = "SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZnZta2hoaG14bWJqbHN5a2hsIn0.secret";
    const result = redactPatterns(input);
    expect(result).not.toContain("kwfvmkhhhmxmbjlsykhl");
    expect(result).toContain("***JWT_REDACTED***");
  });

  it("redacts Authorization: Bearer headers", () => {
    const input = "Authorization: Bearer my-secret-token-1234567890";
    const result = redactPatterns(input);
    expect(result).toBe("Authorization: Bearer ***REDACTED***");
  });

  it("redacts authorization header case-insensitive", () => {
    const input = "authorization: bearer some-long-jwt-token-here";
    const result = redactPatterns(input);
    // Replacement is literal "Authorization: Bearer" but secret is gone
    expect(result).not.toContain("some-long-jwt");
    expect(result).toContain("***REDACTED***");
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

  it("redacts URL with access_token param", () => {
    const input = "https://api.example.com/data?access_token=abc123def456&format=json";
    const result = redactPatterns(input);
    expect(result).toContain("access_token=***REDACTED***");
    // Note: token= pattern may eat past &, but secret is redacted
    expect(result).not.toContain("abc123def456");
  });

  it("redacts URL with key param", () => {
    const input = "https://api.example.com?key=my-secret-key-here";
    const result = redactPatterns(input);
    expect(result).toContain("key=***REDACTED***");
  });

  it("redacts PostgreSQL connection strings", () => {
    const input = "postgresql://user:p4ssw0rd@db.example.com:5432/mydb";
    const result = redactPatterns(input);
    expect(result).toBe("postgresql://***:***@db.example.com:5432/mydb");
    expect(result).not.toContain("p4ssw0rd");
  });

  it("redacts postgres:// connection strings", () => {
    const input = "postgres://postgres.kwfvmkhhhmxmbjlsykhl:lTmm2P7Klhsb4ccS@aws-1-us-east-1.pooler.supabase.com:5432/postgres";
    const result = redactPatterns(input);
    expect(result).not.toContain("lTmm2P7K");
    expect(result).toContain("postgres://***:***@");
  });

  it("leaves clean text untouched", () => {
    const input = "Just a normal log line with no secrets";
    expect(redactPatterns(input)).toBe(input);
  });

  it("handles multiple secrets in one string", () => {
    const input = "key1=sk-proj-abc123def456ghi789jkl012mno and key2=rnd_abcdefghij1234567890klmnop";
    const result = redactPatterns(input);
    expect(result).toContain("sk-***REDACTED***");
    expect(result).toContain("rnd_***REDACTED***");
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

  it("vault secrets take priority over patterns", () => {
    const secrets = {
      MY_TOKEN: "rnd_MWMExosF8vPp6blpuo6Qasepk4lM",
    };
    const input = "Using rnd_MWMExosF8vPp6blpuo6Qasepk4lM for API";
    const result = redact(input, secrets);
    // Vault replaces first (shows last 4), then patterns would not match anymore
    expect(result).not.toContain("MWMExos");
  });
});

describe("containsSecrets", () => {
  it("detects sk- keys", () => {
    expect(containsSecrets("sk-proj-abc123def456ghi789jkl")).toBe(true);
  });

  it("detects rnd_ tokens", () => {
    expect(containsSecrets("rnd_MWMExosF8vPp6blpuo6Qasepk4lM")).toBe(true);
  });

  it("detects rndr_ tokens", () => {
    expect(containsSecrets("rndr_MWMExosF8vPp6blpuo6Qasepk4lM")).toBe(true);
  });

  it("detects vcp_ tokens", () => {
    expect(containsSecrets("vcp_5ecT5KNIAcBSLojhzz8kDUWPvSfs25y")).toBe(true);
  });

  it("detects Authorization headers", () => {
    expect(containsSecrets("Authorization: Bearer xyz123")).toBe(true);
  });

  it("detects JWT tokens (Supabase keys)", () => {
    // Full JWT with enough chars after eyJ (40+ including dots)
    expect(containsSecrets("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZnZta2hoaG14bWJqbHN5a2hsIn0")).toBe(true);
  });

  it("returns false for clean text", () => {
    expect(containsSecrets("Normal log output")).toBe(false);
  });

  it("detects connection strings", () => {
    expect(containsSecrets("postgres://user:pass@host:5432/db")).toBe(true);
  });

  it("detects URL token params", () => {
    expect(containsSecrets("https://api.com?token=secret123")).toBe(true);
  });
});
