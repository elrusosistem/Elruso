#!/usr/bin/env node
// executor.test.mjs — Tests unitarios del executor (sin DB)
// Ejecuta el executor como subprocess con diferentes inputs.
// Uso: node scripts/__tests__/executor.test.mjs

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXECUTOR = resolve(__dirname, "..", "executor.mjs");
const TMP_DIR = resolve(__dirname, "..", "..", "tmp_executor_test");

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  FAIL: ${testName}`);
    failed++;
  }
}

function runExecutor(input) {
  const inputJson = JSON.stringify(input);
  try {
    const output = execSync(`echo '${inputJson.replace(/'/g, "'\\''")}' | node "${EXECUTOR}"`, {
      encoding: "utf-8",
      timeout: 10_000,
    });
    return JSON.parse(output);
  } catch (err) {
    // executor should always exit 0 and write JSON
    const stdout = err.stdout || "";
    try {
      return JSON.parse(stdout);
    } catch {
      return { ok: false, error: "executor_crashed: " + (err.message || "").slice(0, 200) };
    }
  }
}

// ─── Setup ──────────────────────────────────────────────────────────
mkdirSync(TMP_DIR, { recursive: true });

console.log("=== executor.test.mjs ===\n");

// ─── Test 1: Mode A — steps con {name, cmd} ejecutan en orden ──────
console.log("Test 1: Mode A — steps con {name, cmd}");
{
  const result = runExecutor({
    task_id: "T-TEST-001",
    task_type: "generic",
    steps: [
      { name: "echo-hello", cmd: "echo hello" },
      { name: "echo-world", cmd: "echo world" },
    ],
    params: {},
    project_root: TMP_DIR,
  });

  assert(result.ok === true, "ok = true");
  assert(result.mode === "A", "mode = A");
  assert(result.results.length === 2, "2 results");
  assert(result.results[0].name === "echo-hello", "first step name");
  assert(result.results[0].exit_code === 0, "first step exit_code = 0");
  assert(result.results[0].output.includes("hello"), "first step output contains hello");
  assert(result.results[1].name === "echo-world", "second step name");
  assert(typeof result.results[0].duration_ms === "number", "duration_ms is number");
}

// ─── Test 2: Mode B — task_type=echo sin steps → handler genera ────
console.log("\nTest 2: Mode B — task_type=echo handler");
{
  const testFile = resolve(TMP_DIR, "test_echo.txt");
  // Clean up if exists
  try { unlinkSync(testFile); } catch {}

  const result = runExecutor({
    task_id: "T-TEST-002",
    task_type: "echo",
    steps: [],
    params: { message: "funciona", filepath: "test_echo.txt" },
    project_root: TMP_DIR,
  });

  assert(result.ok === true, "ok = true");
  assert(result.mode === "B", "mode = B");
  assert(result.results.length === 1, "1 result (write-file)");
  assert(result.results[0].name === "write-file", "step name = write-file");
  assert(result.results[0].exit_code === 0, "exit_code = 0");

  // Verificar que el archivo se creo
  const fileExists = existsSync(testFile);
  assert(fileExists, "file was created");
  if (fileExists) {
    const content = readFileSync(testFile, "utf-8").trim();
    assert(content === "funciona", "file content = funciona");
  }
}

// ─── Test 3: Sin steps ni handler → no_actionable_steps ────────────
console.log("\nTest 3: Sin steps ni handler → no_actionable_steps");
{
  const result = runExecutor({
    task_id: "T-TEST-003",
    task_type: "unknown_type_xyz",
    steps: [],
    params: {},
    project_root: TMP_DIR,
  });

  assert(result.ok === false, "ok = false");
  assert(result.error === "no_actionable_steps", "error = no_actionable_steps");
  assert(result.results.length === 0, "0 results");
}

// ─── Test 4: Step que falla → para ejecucion, ok=false ─────────────
console.log("\nTest 4: Step que falla → para ejecucion");
{
  const result = runExecutor({
    task_id: "T-TEST-004",
    task_type: "generic",
    steps: [
      { name: "good-step", cmd: "echo ok" },
      { name: "bad-step", cmd: "exit 42" },
      { name: "never-runs", cmd: "echo should-not-run" },
    ],
    params: {},
    project_root: TMP_DIR,
  });

  assert(result.ok === false, "ok = false");
  assert(result.results.length === 2, "2 results (stopped at failure)");
  assert(result.results[0].exit_code === 0, "first step ok");
  assert(result.results[1].exit_code !== 0, "second step failed");
  assert(result.results[1].name === "bad-step", "failed step name = bad-step");
  assert(result.error === "step_failed: bad-step", "error = step_failed: bad-step");
}

// ─── Test 5: Output truncado a 500 chars ────────────────────────────
console.log("\nTest 5: Output truncado a 500 chars");
{
  // Generar output > 500 chars
  const result = runExecutor({
    task_id: "T-TEST-005",
    task_type: "generic",
    steps: [
      { name: "long-output", cmd: "python3 -c \"print('A' * 1000)\"" },
    ],
    params: {},
    project_root: TMP_DIR,
  });

  assert(result.ok === true, "ok = true");
  assert(result.results.length === 1, "1 result");
  // Output should be truncated
  assert(result.results[0].output.length <= 520, "output truncated (<=520 with marker)");
  assert(result.results[0].output.includes("[truncated]"), "output contains [truncated] marker");
}

// ─── Cleanup ────────────────────────────────────────────────────────
try {
  execSync(`rm -rf "${TMP_DIR}"`);
} catch {}

// ─── Summary ────────────────────────────────────────────────────────
console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
