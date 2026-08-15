import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dashboardDist = resolve(root, "apps/dashboard/dist");
const output = resolve(root, "dist");
const client = resolve(output, "client");
const server = resolve(output, "server");
const hosting = JSON.parse(await readFile(resolve(root, ".openai/hosting.json"), "utf8"));
const indexHtml = await readFile(resolve(dashboardDist, "index.html"), "utf8");

const workerSource = `const indexHtml = ${JSON.stringify(indexHtml)};
const securityHeaders = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests",
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return secure(new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } }));
    }
    const url = new URL(request.url);
    if (url.pathname === "/" || !url.pathname.split("/").at(-1).includes(".")) {
      return secure(new Response(request.method === "HEAD" ? null : indexHtml, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60, must-revalidate" }
      }));
    }
    return secure(await env.ASSETS.fetch(request));
  }
};`;

if (typeof hosting.project_id !== "string" || hosting.project_id.length === 0) {
  throw new Error("Sites project_id is required");
}

await rm(output, { recursive: true, force: true });
await mkdir(server, { recursive: true });
await cp(dashboardDist, client, { recursive: true });
await rm(resolve(client, "index.html"));
await writeFile(resolve(server, "index.js"), `${workerSource}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ staged: true, client, worker: "dist/server/index.js" })}\n`);
