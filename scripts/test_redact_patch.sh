#!/usr/bin/env bash
set -euo pipefail
# test_redact_patch.sh — Verifica que redact_patch.mjs redacta correctamente

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REDACT="node ${SCRIPT_DIR}/redact_patch.mjs"
PASS=0
FAIL=0

check() {
  local desc="$1"
  local input="$2"
  local forbidden="$3"

  local output
  output=$(echo "$input" | $REDACT 2>/dev/null)
  local ec=$?

  if [ $ec -ne 0 ]; then
    echo "FAIL: ${desc} (exit code ${ec})"
    FAIL=$((FAIL + 1))
    return
  fi

  if echo "$output" | grep -qF "$forbidden"; then
    echo "FAIL: ${desc} — output still contains '${forbidden}'"
    FAIL=$((FAIL + 1))
  else
    echo "PASS: ${desc}"
    PASS=$((PASS + 1))
  fi
}

check_clean() {
  local desc="$1"
  local input="$2"
  local expected="$3"

  local output
  output=$(echo "$input" | $REDACT 2>/dev/null)
  if [ "$output" = "$expected" ]; then
    echo "PASS: ${desc}"
    PASS=$((PASS + 1))
  else
    echo "FAIL: ${desc} — expected '${expected}', got '${output}'"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Testing redact_patch.mjs ==="

# 1. OpenAI sk- keys
check "sk- key redacted" \
  "OPENAI_API_KEY=sk-proj-OzSkUNuTPqbWcRMN6Jz4CxyKtFVxrKyoD9xfECkj8C" \
  "OzSkUNu"

# 2. Vercel vcp_ tokens
check "vcp_ token redacted" \
  "VERCEL_TOKEN=vcp_5ecT5KNIAcBSLojhzz8kDUWPvSfs25yKiTUeq" \
  "5ecT5KN"

# 3. Render rnd_ tokens
check "rnd_ token redacted" \
  "RENDER_TOKEN=rnd_MWMExosF8vPp6blpuo6Qasepk4lM" \
  "MWMExos"

# 4. Render rndr_ tokens
check "rndr_ token redacted" \
  "Using rndr_MWMExosF8vPp6blpuo6Qasepk4lM for deploy" \
  "MWMExos"

# 5. JWT tokens (Supabase keys)
check "JWT token redacted" \
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZnZta2hoaG14bWJqbHN5a2hsIn0.secret" \
  "kwfvmkh"

# 6. Authorization Bearer
check "Authorization header redacted" \
  "Authorization: Bearer my-secret-token-1234567890" \
  "my-secret-token"

# 7. Postgres connection string
check "postgres connstring redacted" \
  "postgres://postgres.kwfvmkhhhmxmbjlsykhl:lTmm2P7Klhsb4ccS@aws-1-us-east-1.pooler.supabase.com:5432/postgres" \
  "lTmm2P7K"

# 8. URL with token param
check "URL token param redacted" \
  "https://api.example.com?token=my-secret-here" \
  "my-secret-here"

# 9. Clean text passes through
check_clean "clean text unchanged" \
  "Just a normal log line" \
  "Just a normal log line"

# 10. Empty input OK
output=$(echo "" | $REDACT 2>/dev/null)
ec=$?
if [ $ec -eq 0 ]; then
  echo "PASS: empty input accepted"
  PASS=$((PASS + 1))
else
  echo "FAIL: empty input rejected"
  FAIL=$((FAIL + 1))
fi

# 11. Multiple secrets in one line
check "multiple secrets redacted" \
  "sk-proj-abc123def456ghi789jkl012mno and vcp_abcdef1234567890ghijklmnop" \
  "abc123def"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="

if [ $FAIL -gt 0 ]; then
  exit 1
fi
