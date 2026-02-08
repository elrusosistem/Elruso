import type { Task } from "@elruso/types";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 5000;

async function tick(): Promise<void> {
  // Fase 3: aquí se polleará la tabla tasks y se ejecutarán
  console.log(`[worker] tick at ${new Date().toISOString()} - no tasks configured yet`);
}

async function main(): Promise<void> {
  console.log("[worker] Elruso Worker starting...");
  console.log(`[worker] Poll interval: ${POLL_INTERVAL_MS}ms`);

  // Loop principal
  const run = async () => {
    while (true) {
      try {
        await tick();
      } catch (err) {
        console.error("[worker] tick error:", err);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  };

  await run();
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
