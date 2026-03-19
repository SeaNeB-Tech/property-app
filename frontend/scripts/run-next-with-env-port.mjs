import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

const command = process.argv[2] || "dev";
const envKey = process.argv[3] || "NEXT_PUBLIC_APP_URL";
const explicitPort = String(process.argv[4] || process.env.PORT || "").trim();
const defaultPort = String(process.env.DEFAULT_PORT || "3000").trim();

const rootDir = process.cwd();
const envFiles = [".env"];

const readEnvValue = (key) => {
  const fromProcess = process.env[key];
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return fromProcess.trim().replace(/^['"]|['"]$/g, "");
  }

  for (const fileName of envFiles) {
    const filePath = path.join(rootDir, fileName);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!match) continue;
    return match[1].trim().replace(/^['"]|['"]$/g, "");
  }
  return "";
};

const rawUrl = readEnvValue(envKey);
let port = explicitPort;
let parsedUrl = null;

if (!port && rawUrl) {
  try {
    parsedUrl = new URL(rawUrl);
    if (parsedUrl.port) port = parsedUrl.port;
  } catch {
    // Handled by validation below.
  }
}

const isValidPort = (value) => {
  const num = Number(value);
  return Number.isInteger(num) && num >= 1 && num <= 65535;
};

if (!port) {
  port = defaultPort;
}

if (!isValidPort(port)) {
  console.error(`[run-next-with-env-port] Invalid port: "${port}".`);
  process.exit(1);
}

const canBind = (host, p) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", (err) => resolve({ ok: false, code: err?.code }));
    server.listen({ host, port: Number(p) }, () => server.close(() => resolve({ ok: true, code: null })));
  });

const isPortAvailable = async (p) => {
  // Next.js commonly binds to IPv6 on Windows (e.g. :::3000). If IPv6 bind fails
  // with EADDRINUSE, we must treat the port as unavailable even if IPv4 bind works.
  const v6 = await canBind("::", p);
  if (v6.ok) return true;

  // Some environments don't support IPv6 binding; fall back to IPv4 in that case.
  if (v6.code === "EADDRNOTAVAIL" || v6.code === "EAFNOSUPPORT" || v6.code === "EINVAL") {
    const v4 = await canBind("0.0.0.0", p);
    return v4.ok;
  }

  return false;
};

const findAvailablePort = async (startPort, attempts = 20) => {
  let candidate = Number(startPort);
  for (let i = 0; i < attempts; i += 1) {
    if (await isPortAvailable(String(candidate))) return String(candidate);
    candidate += 1;
  }
  return String(startPort);
};

const isExplicit = Boolean(explicitPort);
if (!(await isPortAvailable(port))) {
  if (isExplicit) {
    console.error(`[run-next-with-env-port] Port ${port} is already in use. Set PORT to a free port.`);
    process.exit(1);
  }

  const nextPort = await findAvailablePort(port);
  if (nextPort !== port) {
    console.warn(`[run-next-with-env-port] Port ${port} is in use; using ${nextPort} instead.`);
    port = nextPort;
  }
}

const args = ["next", command];
args.push("-p", port);

const childEnv = { ...process.env, PORT: port };
const parseHostList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
const devHosts = new Set(
  parseHostList(process.env.LOCAL_DEV_HOSTS || process.env.NEXT_PUBLIC_LOCAL_DEV_HOSTS)
);
const shouldRewriteEnvUrl =
  parsedUrl && devHosts.size && devHosts.has(parsedUrl.hostname.toLowerCase());
if (shouldRewriteEnvUrl) {
  const updated = new URL(parsedUrl.toString());
  updated.port = port;
  childEnv[envKey] = updated.toString();
}

const run = (runArgs) =>
  new Promise((resolve) => {
    const c = spawn("npx", runArgs, { stdio: "inherit", shell: true, env: childEnv });
    c.on("exit", (code) => resolve(code ?? 1));
  });

(async () => {
  // Try default (Turbopack) first. If it fails, retry with webpack dev server.
  let exitCode = await run(args);
  if (exitCode !== 0) {
    try {
      // Retry with webpack which is more reliable on some Windows setups.
      const retryArgs = [...args, "--webpack"];
      console.warn("[run-next-with-env-port] Turbopack dev failed; retrying with --webpack...");
      exitCode = await run(retryArgs);
    } catch (e) {
      // ignore
    }
  }
  process.exit(exitCode);
})();
