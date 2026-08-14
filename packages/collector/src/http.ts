import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { DurableProbeResultCollector } from "./durable-collector.js";

export function createCollectorHttpServer(
  collector: DurableProbeResultCollector,
  options: { readonly maxBodyBytes?: number } = {},
): Server {
  const maxBodyBytes = options.maxBodyBytes ?? 256 * 1024;
  const server = createServer(async (request, response) => {
    try {
      if (!isLoopback(request.socket.remoteAddress)) return send(response, 403, { status: "REJECTED", reason: "loopback clients only" });
      if (request.method === "GET" && request.url === "/health") return send(response, 200, { status: "ok", storedCount: collector.storedCount() });
      if (request.method !== "POST" || request.url !== "/v0/probe-results") return send(response, 404, { status: "REJECTED", reason: "not found" });
      if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        return send(response, 415, { status: "REJECTED", reason: "application/json required" });
      }
      const body = await readBody(request, maxBodyBytes);
      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        return send(response, 400, { status: "REJECTED", reason: "invalid JSON" });
      }
      const outcome = await collector.ingest(value);
      const statusCode = outcome.status === "ACCEPTED" ? 201 : outcome.status === "DUPLICATE" ? 200 : 422;
      return send(response, statusCode, outcome);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "collector request failed";
      return send(response, reason === "request body exceeds limit" ? 413 : 500, { status: "REJECTED", reason });
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return server;
}

function readBody(request: IncomingMessage, maxBodyBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    request.on("data", (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBodyBytes) {
        settled = true;
        reject(new Error("request body exceeds limit"));
        request.resume();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!settled) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", error => {
      if (!settled) reject(error);
    });
  });
}

function send(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
