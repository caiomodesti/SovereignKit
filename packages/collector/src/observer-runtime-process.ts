import { resolve } from "node:path";

import { createObserverHealthServer, loadObserverRuntimeConfig, ObserverDeliveryRuntime } from "./observer-runtime.js";

const [configPath] = process.argv.slice(2);
if (configPath === undefined) throw new Error("usage: sovereignkit-observer-runtime <config.json>");

const config = await loadObserverRuntimeConfig(resolve(configPath));
const runtime = await ObserverDeliveryRuntime.open(config);
const server = createObserverHealthServer(runtime);
const controller = new AbortController();

server.listen(config.healthPort, config.healthHost, () => {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("observer health server did not bind a TCP port");
  process.stdout.write(`${JSON.stringify({
    event: "OBSERVER_RUNTIME_READY",
    pid: process.pid,
    observerId: runtime.snapshot().observerId,
    keyId: runtime.snapshot().keyId,
    healthHost: config.healthHost,
    healthPort: address.port,
  })}\n`);
});

const run = runtime.run(controller.signal, snapshot => {
  process.stdout.write(`${JSON.stringify({ event: "OBSERVER_HEARTBEAT", ...snapshot })}\n`);
});

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  controller.abort();
  await run;
  await new Promise<void>((resolveClose, reject) => server.close(error => error === undefined ? resolveClose() : reject(error)));
  await runtime.close();
}

process.on("SIGINT", () => { void stop(); });
process.on("SIGTERM", () => { void stop(); });
