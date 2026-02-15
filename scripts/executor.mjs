#!/usr/bin/env node
// executor.mjs — Motor de ejecucion de tasks para el runner.
// Lee JSON de stdin, ejecuta steps, escribe resultado JSON a stdout.
//
// Input: { task_id, task_type, steps, params, project_root }
// Output: { ok, results: [{name, cmd, exit_code, output, duration_ms}], error? }
//
// Modos:
//   A: steps contiene objetos {name, cmd} → ejecuta cada uno en orden
//   B: sin steps ejecutables → busca handler por task_type
//   Sin match → { ok: false, error: "no_actionable_steps" }
//
// Uso: echo '{"task_id":"T-1","task_type":"echo","steps":[],"params":{"message":"hola","filepath":"out.txt"},"project_root":"/tmp"}' | node scripts/executor.mjs

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_OUTPUT = 500;

// ─── Handlers builtin ────────────────────────────────────────────────

const handlers = {
  /** echo — crea archivo con mensaje (demo E2E) */
  echo(params, projectRoot) {
    const message = params.message || "hello from executor";
    const filepath = params.filepath || "docs/executor_output.txt";
    // Generar step para crear el archivo
    return [
      {
        name: "write-file",
        cmd: `mkdir -p "$(dirname '${projectRoot}/${filepath}')" && echo '${message.replace(/'/g, "'\\''")}' > '${projectRoot}/${filepath}'`,
      },
    ];
  },

  /** shell — ejecuta steps con cmd directamente (pass-through) */
  shell(params) {
    const cmds = params.commands || [];
    return cmds.map((c, i) => ({
      name: c.name || `step-${i + 1}`,
      cmd: c.cmd,
    }));
  },
};

// ─── Ejecutar un step ────────────────────────────────────────────────

function executeStep(step, projectRoot) {
  const start = Date.now();
  let output = "";
  let exitCode = 0;

  try {
    output = execSync(step.cmd, {
      cwd: projectRoot,
      timeout: 30_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    exitCode = err.status || 1;
    output = (err.stdout || "") + (err.stderr || "");
  }

  // Truncar output
  if (output.length > MAX_OUTPUT) {
    output = output.slice(0, MAX_OUTPUT) + "...[truncated]";
  }

  return {
    name: step.name || "unnamed",
    cmd: step.cmd,
    exit_code: exitCode,
    output: output.trim(),
    duration_ms: Date.now() - start,
  };
}

// ─── Resolver steps ──────────────────────────────────────────────────

function resolveSteps(input) {
  const { task_type, steps, params, project_root } = input;
  const projectRoot = project_root || process.cwd();

  // Modo A: steps contiene objetos {name, cmd}
  if (Array.isArray(steps) && steps.length > 0) {
    const executableSteps = steps.filter(
      (s) => typeof s === "object" && s !== null && typeof s.cmd === "string"
    );
    if (executableSteps.length > 0) {
      return { mode: "A", steps: executableSteps, projectRoot };
    }
  }

  // Modo B: handler por task_type
  const handler = handlers[task_type];
  if (handler) {
    const generatedSteps = handler(params || {}, projectRoot);
    if (generatedSteps && generatedSteps.length > 0) {
      return { mode: "B", steps: generatedSteps, projectRoot };
    }
  }

  // Sin match
  return { mode: null, steps: [], projectRoot };
}

// ─── Main ────────────────────────────────────────────────────────────

function main() {
  let input;
  try {
    const raw = readFileSync("/dev/stdin", "utf-8");
    input = JSON.parse(raw);
  } catch (err) {
    const result = { ok: false, results: [], error: "invalid_input: " + err.message };
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }

  const resolved = resolveSteps(input);

  if (resolved.mode === null || resolved.steps.length === 0) {
    const result = { ok: false, results: [], error: "no_actionable_steps" };
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }

  const results = [];
  let allOk = true;

  for (const step of resolved.steps) {
    const result = executeStep(step, resolved.projectRoot);
    results.push(result);

    if (result.exit_code !== 0) {
      allOk = false;
      break; // Parar al primer fallo
    }
  }

  const output = {
    ok: allOk,
    mode: resolved.mode,
    results,
    ...(allOk ? {} : { error: `step_failed: ${results[results.length - 1].name}` }),
  };

  process.stdout.write(JSON.stringify(output));
}

main();
